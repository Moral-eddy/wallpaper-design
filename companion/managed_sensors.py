from pathlib import Path
import ctypes
from ctypes import wintypes as W
import hashlib
import json
import os
import subprocess
import threading
import time
import uuid
from worker_integrity import EXPECTED_WORKER_SHA256

class SHELLEXECUTEINFO(ctypes.Structure):
    _fields_ = [('cbSize',W.DWORD),('fMask',W.ULONG),('hwnd',W.HWND),('lpVerb',W.LPCWSTR),
                ('lpFile',W.LPCWSTR),('lpParameters',W.LPCWSTR),('lpDirectory',W.LPCWSTR),
                ('nShow',ctypes.c_int),('hInstApp',W.HINSTANCE),('lpIDList',ctypes.c_void_p),
                ('lpClass',W.LPCWSTR),('hkeyClass',W.HKEY),('dwHotKey',W.DWORD),
                ('hIcon',W.HANDLE),('hProcess',W.HANDLE)]

class ElevatedProcess:
    def __init__(self, executable, arguments, directory):
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.GetExitCodeProcess.argtypes = [W.HANDLE,ctypes.POINTER(W.DWORD)]
        self.kernel.GetExitCodeProcess.restype = W.BOOL
        self.kernel.WaitForSingleObject.argtypes = [W.HANDLE,W.DWORD]
        self.kernel.CloseHandle.argtypes = [W.HANDLE]
        shell = ctypes.WinDLL('shell32', use_last_error=True)
        shell.ShellExecuteExW.argtypes = [ctypes.POINTER(SHELLEXECUTEINFO)]
        shell.ShellExecuteExW.restype = W.BOOL
        info = SHELLEXECUTEINFO()
        info.cbSize = ctypes.sizeof(info)
        info.fMask = 0x40 | 0x100 | 0x400
        info.lpVerb = 'runas'
        info.lpFile = str(executable)
        info.lpParameters = subprocess.list2cmdline(arguments)
        info.lpDirectory = str(directory)
        info.nShow = 0
        ole = ctypes.WinDLL('ole32', use_last_error=True)
        ole.CoInitializeEx.argtypes = [ctypes.c_void_p,W.DWORD]
        ole.CoInitializeEx.restype = ctypes.c_long
        initialized = ole.CoInitializeEx(None, 0x2 | 0x4) in (0,1)
        try:
            launched = shell.ShellExecuteExW(ctypes.byref(info))
            error = ctypes.get_last_error()
        finally:
            if initialized:
                ole.CoUninitialize()
        if not launched:
            if error == 1223:
                raise PermissionError('管理员授权已取消；其他硬件采集仍可使用。')
            raise ctypes.WinError(error)
        if not info.hProcess:
            raise OSError('温度辅助进程未返回运行句柄。')
        self.handle = info.hProcess

    def poll(self):
        code = W.DWORD()
        if not self.kernel.GetExitCodeProcess(self.handle,ctypes.byref(code)):
            raise ctypes.WinError(ctypes.get_last_error())
        return None if code.value == 259 else code.value

    def close(self):
        if self.handle:
            self.kernel.WaitForSingleObject(self.handle, 6000)
            self.kernel.CloseHandle(self.handle)
            self.handle = None

def registered_export_paths(current=None, installation_path=None):
    found = []
    if current is not None:
        found.append(Path(current))
    installation_path = Path(installation_path) if installation_path else Path(
        os.environ.get('PROGRAMDATA','C:/ProgramData')) / 'MornyeWallpaperSensors/installation.json'
    try:
        value = json.loads(installation_path.read_text(encoding='utf-8-sig'))
        if isinstance(value.get('output'), str):
            path = Path(value['output'])
            if path not in found:
                found.append(path)
    except (OSError, ValueError, AttributeError):
        pass
    return found

class ManagedExporter:
    def __init__(self, data_root, resource, launcher=ElevatedProcess):
        self.data_root = Path(data_root)
        self.resource = Path(resource)
        self.launcher = launcher
        self.process = None
        self.session_root = self.export_path = self.stop_path = self.heartbeat_path = None
        self.finished = threading.Event()
        self.heartbeat_thread = None

    def launch_plan(self):
        if hashlib.sha256(self.resource.read_bytes()).hexdigest() != EXPECTED_WORKER_SHA256:
            raise ValueError('内置温度读取器内容不匹配，未请求管理员运行。请重新获取完整程序。')
        self.session_root = self.data_root / 'managed-alienware' / uuid.uuid4().hex
        self.session_root.mkdir(parents=True)
        self.export_path = self.session_root / 'alienware-live.json'
        self.stop_path = self.session_root / 'stop.signal'
        self.heartbeat_path = self.session_root / 'owner.heartbeat'
        self.heartbeat_path.touch()
        self.export_path.write_text(json.dumps({'schemaVersion':1,'timestampMs':time.time()*1000,
                'status':'offline','sensors':[],'fans':[],
                'message':'正在启动Alienware温度读取器，请等待传感器枚举。'}), encoding='utf-8')
        executable = Path(os.environ.get('SystemRoot','C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        arguments = ['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass',
                     '-File',str(self.resource),'-OutputPath',str(self.export_path),
                     '-StopPath',str(self.stop_path),'-HeartbeatPath',str(self.heartbeat_path)]
        return executable, arguments, self.session_root

    def start(self):
        if self.process and self.process.poll() is None:
            return self.export_path
        executable, arguments, directory = self.launch_plan()
        self.process = self.launcher(executable, arguments, directory)
        self.finished.clear()
        self.heartbeat_thread = threading.Thread(target=self.keep_lease,daemon=True)
        self.heartbeat_thread.start()
        return self.export_path

    def keep_lease(self):
        while not self.finished.wait(1):
            try:
                if self.process.poll() is not None:
                    return
                self.heartbeat_path.touch()
            except OSError:
                return

    def poll(self):
        return self.process.poll() if self.process else None

    def stop(self):
        self.finished.set()
        if self.heartbeat_thread:
            self.heartbeat_thread.join(timeout=2)
        if self.process:
            try:
                self.stop_path.write_text('stop',encoding='ascii')
            except OSError:
                # Deleted/unsubscribed data directories also invalidate the
                # heartbeat lease; do not recreate Steam-managed directories.
                pass
            self.process.close()
            self.process = None
