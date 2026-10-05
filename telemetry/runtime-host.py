"""Per-user production process host: fixed URL, hidden worker, crash restart."""
from pathlib import Path
from datetime import datetime
from ctypes import wintypes as W
import ctypes as C
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
LOG = ROOT / 'records/runtime-host.log'
STATE = ROOT / 'records/runtime-host-state.json'
PORT = 64582

def save_state(status, **fields):
    state = {'status': status, 'timestamp': datetime.now().astimezone().isoformat(),
             'processId': os.getpid(), 'port': PORT, 'url': f'http://127.0.0.1:{PORT}/index.html', **fields}
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(STATE)

def main():
    (ROOT / 'records').mkdir(parents=True, exist_ok=True)
    kernel = C.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [C.c_void_p, W.BOOL, W.LPCWSTR]
    kernel.CreateMutexW.restype = W.HANDLE
    kernel.CloseHandle.argtypes = [W.HANDLE]
    kernel.CloseHandle.restype = W.BOOL
    name = 'Local\\MornyeWallpaperTelemetry-' + hashlib.sha256(str(ROOT).lower().encode()).hexdigest()[:16]
    handle = kernel.CreateMutexW(None, False, name)
    if not handle: raise C.WinError(C.get_last_error())
    if C.get_last_error() == 183:
        kernel.CloseHandle(handle)
        return
    worker = None
    delay = 5
    try:
        while True:
            if LOG.is_file() and LOG.stat().st_size > 2 * 1024 * 1024:
                LOG.replace(LOG.with_suffix('.previous.log'))
            with LOG.open('a', encoding='utf-8') as output:
                output.write('\n' + datetime.now().astimezone().isoformat() + ' Starting local collector\n')
                output.flush()
                command = [sys.executable, '-X', 'utf8', str(ROOT / 'serve.py'), '--port', str(PORT)]
                started = time.monotonic()
                worker = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL,
                    stdout=output, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
                save_state('running', workerProcessId=worker.pid, role='本机生产采集；运行表现待用户人眼检验')
                code = worker.wait()
                worker = None
                save_state('port_in_use' if code == 3 else 'restarting', workerExitCode=code)
                if code == 3: return
                if time.monotonic() - started > 300: delay = 5
                output.write(f'Collector exited with {code}; restart in {delay}s\n')
            time.sleep(delay)
            delay = min(delay * 2, 60)
    finally:
        if worker and worker.poll() is None:
            worker.terminate()
            worker.wait(timeout=10)
        kernel.CloseHandle(handle)

if __name__ == '__main__':
    main()
