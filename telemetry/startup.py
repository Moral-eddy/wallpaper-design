"""Install/remove this collector's independent current-user Windows task."""
from pathlib import Path
import argparse
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['install', 'uninstall'])
    args = parser.parse_args()
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    if not pythonw.is_file():
        raise SystemExit('此 Python 环境没有 pythonw.exe，未更改启动配置。')
    powershell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    legacy = subprocess.list2cmdline([str(pythonw), '-X', 'utf8', str(ROOT / 'runtime-host.py')])
    command = [str(powershell), '-NoLogo', '-NoProfile', '-NonInteractive',
               '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
               '-File', str(ROOT / 'install-telemetry-task.ps1'),
               '-Action', args.action, '-PythonPath', str(pythonw),
               '-LegacyCommand', legacy]
    result = subprocess.run(command, cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
