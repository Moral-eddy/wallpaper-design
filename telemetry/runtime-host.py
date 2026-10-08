"""Production collector supervisor, owned by a current-user Windows task.

No HTTP probes or synthetic samples. State timestamps record process activity.
The Windows task also restarts this host if the whole process chain stops.
"""
from pathlib import Path
from datetime import datetime
from ctypes import wintypes as W
import ctypes as C
import faulthandler
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
import traceback

ROOT = Path(__file__).resolve().parent
RECORDS = ROOT / 'records'
LOG = RECORDS / 'runtime-host.log'
WORKER_LOG = RECORDS / 'collector-runtime.log'
STATE = RECORDS / 'runtime-host-state.json'
PORT = 64582
HEARTBEAT_SECONDS = 15
LOG_LIMIT_BYTES = 2 * 1024 * 1024
FAULT_LIMIT_BYTES = 128 * 1024
HOST_STARTED = datetime.now().astimezone().isoformat()


class BoundedLog:
    """Bounded production output: current file and one previous file only."""
    def __init__(self, path):
        self.path = path
        self.previous = path.with_suffix('.previous.log')
        self.lock = threading.Lock()

    def write(self, data):
        # Fixed-size chunks also bound memory for long messages without newlines.
        with self.lock:
            for offset in range(0, len(data), 8192):
                chunk = data[offset:offset + 8192]
                try:
                    size = self.path.stat().st_size if self.path.exists() else 0
                    if size + len(chunk) > LOG_LIMIT_BYTES:
                        self.path.replace(self.previous)
                    with self.path.open('ab') as output:
                        output.write(chunk)
                except OSError:
                    # If rotation is blocked, drop this diagnostic chunk instead
                    # of exceeding the cap or interrupting production collection.
                    return


host_log = BoundedLog(LOG)
worker_log = BoundedLog(WORKER_LOG)


def now():
    return datetime.now().astimezone().isoformat()


def log(message):
    host_log.write((now() + ' ' + message + '\n').encode('utf-8', errors='replace'))


def drain_worker_output(pipe):
    # Drain continuously even when a log cannot be written, so the collector is
    # not blocked by a full stdout pipe. No unbounded in-memory queue is used.
    try:
        while True:
            chunk = pipe.read1(8192)
            if not chunk:
                break
            worker_log.write(chunk)
    except OSError as error:
        log('Worker output pipe unavailable: ' + repr(error))
    finally:
        pipe.close()


def open_fault_log():
    # faulthandler writes directly to an OS file descriptor. Rotate before
    # enabling it; one fatal dump may exceed the threshold before the next start.
    path = RECORDS / 'runtime-host-fault.log'
    output = None
    try:
        if path.exists() and path.stat().st_size >= FAULT_LIMIT_BYTES:
            path.replace(path.with_suffix('.previous.log'))
        output = path.open('a', encoding='utf-8')
        faulthandler.enable(file=output)
        return output
    except (OSError, RuntimeError):
        if output:
            output.close()
        return None


def save_state(status, **fields):
    state = {'hostVersion': 3, 'status': status, 'timestamp': now(),
             'hostStartedAt': HOST_STARTED, 'processId': os.getpid(),
             'parentProcessId': os.getppid(), 'port': PORT,
             'heartbeatIntervalSeconds': HEARTBEAT_SECONDS,
             'logRetention': {'normalFileLimitBytes': LOG_LIMIT_BYTES,
                              'previousFilesPerLog': 1,
                              'faultRotationThresholdBytes': FAULT_LIMIT_BYTES},
             'url': f'http://127.0.0.1:{PORT}/configure.html',
             'role': '生产运行记录；桌面效果待用户人眼检验', **fields}
    try:
        temporary = STATE.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(STATE)
    except OSError as error:
        log('State write unavailable: ' + repr(error))


def run_host():
    RECORDS.mkdir(parents=True, exist_ok=True)
    kernel = C.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [C.c_void_p, W.BOOL, W.LPCWSTR]
    kernel.CreateMutexW.restype = W.HANDLE
    kernel.CloseHandle.argtypes = [W.HANDLE]
    kernel.CloseHandle.restype = W.BOOL
    name = 'Local\\MornyeWallpaperTelemetry-' + hashlib.sha256(str(ROOT).lower().encode()).hexdigest()[:16]
    handle = kernel.CreateMutexW(None, False, name)
    mutex_error = C.get_last_error()
    if not handle:
        raise C.WinError(mutex_error)
    if mutex_error == 183:
        kernel.CloseHandle(handle)
        return 0

    worker = None
    delay = 5
    fault_output = None
    try:
        fault_output = open_fault_log()
        log(f'Host started pid={os.getpid()} parent={os.getppid()} executable={sys.executable}')
        while True:
            started = time.monotonic()
            try:
                command = [sys.executable, '-u', '-X', 'utf8', str(ROOT / 'serve.py'), '--port', str(PORT)]
                worker = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    creationflags=subprocess.CREATE_NO_WINDOW)
                output_reader = threading.Thread(target=drain_worker_output, args=(worker.stdout,), daemon=True)
                output_reader.start()
                log(f'Collector started pid={worker.pid}')
                while True:
                    save_state('running', workerProcessId=worker.pid,
                               uptimeSeconds=round(time.monotonic() - started))
                    try:
                        code = worker.wait(timeout=HEARTBEAT_SECONDS)
                        break
                    except subprocess.TimeoutExpired:
                        continue
                output_reader.join(timeout=2)
                worker = None
                # A surviving older collector or another owner may still have
                # the port. Wait and retry; never terminate an unrelated owner.
                if code == 3:
                    pause = 30
                    status = 'waiting_for_port'
                else:
                    if time.monotonic() - started > 300:
                        delay = 5
                    pause = delay
                    status = 'restarting'
                    delay = min(delay * 2, 60)
                log(f'Collector exited code={code}; {status}; retry in {pause}s')
                save_state(status, workerExitCode=code, retryAfterSeconds=pause)
            except Exception:
                # Keep this error in the host log, separate from worker output.
                log('Host iteration failed:\n' + traceback.format_exc())
                if worker is not None and worker.poll() is None:
                    worker.terminate()
                    try:
                        worker.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        worker.kill()
                        worker.wait()
                worker = None
                pause = delay
                delay = min(delay * 2, 60)
                save_state('restarting', reason='host_iteration_exception', retryAfterSeconds=pause)
            # Also refresh the production state while waiting to retry.
            remaining = pause
            while remaining > 0:
                step = min(remaining, HEARTBEAT_SECONDS)
                time.sleep(step)
                remaining -= step
                save_state('retry_wait', retryAfterSeconds=remaining)
    finally:
        if worker is not None and worker.poll() is None:
            worker.terminate()
            try:
                worker.wait(timeout=10)
            except subprocess.TimeoutExpired:
                worker.kill()
                worker.wait()
        save_state('stopped')
        log('Host stopped')
        if fault_output:
            faulthandler.disable()
            fault_output.close()
        kernel.CloseHandle(handle)


if __name__ == '__main__':
    try:
        sys.exit(run_host())
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception:
        log('Fatal host error:\n' + traceback.format_exc())
        sys.exit(1)
