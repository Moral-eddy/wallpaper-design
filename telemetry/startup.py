"""Install/remove only this wallpaper's current-user login entry."""
from pathlib import Path
from datetime import datetime
import argparse
import json
import subprocess
import sys
import winreg

ROOT = Path(__file__).resolve().parent
KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'
NAME = 'MornyeWallpaperTelemetry'
RECORD = ROOT / 'records/collector-startup.json'

def main():
    (ROOT / 'records').mkdir(parents=True, exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['install', 'uninstall'])
    args = parser.parse_args()
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    if not pythonw.is_file(): raise SystemExit('此 Python 环境没有 pythonw.exe，未更改启动项。')
    command = subprocess.list2cmdline([str(pythonw), '-X', 'utf8', str(ROOT / 'runtime-host.py')])
    if len(command) > 260: raise SystemExit('启动命令超过 Windows Run 项长度，未更改启动项。')
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, KEY, 0, winreg.KEY_QUERY_VALUE | winreg.KEY_SET_VALUE) as key:
        try: previous, previous_type = winreg.QueryValueEx(key, NAME)
        except FileNotFoundError: previous, previous_type = None, None
        if previous is not None and previous != command: raise SystemExit('同名启动项属于其他安装，未覆盖。')
        if args.action == 'install':
            winreg.SetValueEx(key, NAME, 0, winreg.REG_SZ, command)
            state = {'installed': True, 'installedAt': datetime.now().astimezone().isoformat(),
                     'scope': 'HKCU / current user logon', 'name': NAME, 'command': command,
                     'url': 'http://127.0.0.1:64582/index.html', 'review': '待用户重启后人眼检验'}
        else:
            if previous is not None: winreg.DeleteValue(key, NAME)
            state = {'installed': False, 'uninstalledAt': datetime.now().astimezone().isoformat(), 'name': NAME}
        RECORD.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    print('本机采集器登录启动项已' + ('登记；重启表现待你人眼检验。' if args.action == 'install' else '移除。'))

if __name__ == '__main__':
    main()
