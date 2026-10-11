from pathlib import Path
import argparse
import json
import logging
import sys
import time
import webbrowser
from companion_core import APP_VERSION, Runtime, SingleInstance, default_data_root, discover_wallpapers, validate_wallpaper, wallpaper_data_root

def page_path():
    return Path(__file__).resolve().parent / 'configure.html'

def gui(data_root, port):
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox
    lock = None
    root = tk.Tk()
    root.title('星海观测室 · 硬件采集器')
    root.geometry('760x540')
    root.minsize(700, 500)
    app = None
    directory = tk.StringVar()
    message = tk.StringVar(value='选择已订阅壁纸的目录，然后点击“配置并启动”。')
    frame = ttk.Frame(root, padding=22)
    frame.pack(fill='both', expand=True)
    ttk.Label(frame, text='星海观测室 · 硬件采集器', font=('Microsoft YaHei UI', 16)).pack(anchor='w')
    ttk.Label(frame, text='无需安装 Python；普通权限运行。音乐由 Wallpaper Engine 提供。').pack(anchor='w', pady=(8, 18))
    ttk.Label(frame, text='壁纸目录（包含 project.json 和 index.html）').pack(anchor='w')
    row = ttk.Frame(frame)
    row.pack(fill='x', pady=8)
    ttk.Entry(row, textvariable=directory).pack(side='left', fill='x', expand=True)
    def pick():
        chosen = filedialog.askdirectory(title='选择实际订阅壁纸目录', parent=root)
        if chosen:
            directory.set(chosen)
    ttk.Button(row, text='选择目录', command=pick).pack(side='right', padx=(8, 0))

    def ensure_app():
        nonlocal app, lock
        if not directory.get().strip():
            raise ValueError('请先选择壁纸订阅目录。')
        target = validate_wallpaper(directory.get().strip().strip('"'))
        target_data = Path(data_root).resolve() if data_root else wallpaper_data_root(target)
        if app is not None and app.data_root != target_data:
            app.close()
            lock.close()
            app = lock = None
        if app is None:
            new_lock = SingleInstance(target_data)
            if new_lock.already_running:
                new_lock.close()
                raise ValueError('这个壁纸目录已有采集器运行，请使用现有窗口。')
            try:
                app = Runtime(target_data, page_path(), port)
            except Exception:
                new_lock.close()
                raise
            lock = new_lock
        app.bind(target)
        return app

    def detect():
        targets = discover_wallpapers()
        if len(targets) == 1:
            directory.set(str(targets[0]))
            message.set('已找到订阅目录，请点击“配置并启动”。')
        elif targets:
            message.set('发现多个订阅目录，请使用“选择目录”指定正在应用的副本。')
        else:
            message.set('未找到订阅副本。先在 Steam 订阅并下载，或手动选择壁纸目录。')

    def execute(action):
        try:
            action()
        except Exception as error:
            if app:
                app.logger.exception('User operation failed')
            message.set(str(error))
            messagebox.showerror('操作未完成', str(error), parent=root)

    def configure():
        if not directory.get().strip():
            raise ValueError('请先选择壁纸目录。')
        ensure_app()
        message.set(f'配置已写入，采集已启动（端口 {app.port}）。\n请重新加载壁纸；来源设置可选择网卡和温度。')

    buttons = ttk.Frame(frame)
    buttons.pack(fill='x', pady=12)
    ttk.Button(buttons, text='自动查找', command=lambda:execute(detect)).pack(side='left')
    ttk.Button(buttons, text='配置并启动', command=lambda:execute(configure)).pack(side='left', padx=8)
    def source_page():
        ensure_app()
        webbrowser.open(app.url)
    ttk.Button(buttons, text='打开来源设置', command=lambda:execute(source_page)).pack(side='left')
    def choose_csv():
        filename = filedialog.askopenfilename(title='选择持续更新的 HWiNFO CSV', parent=root,
                                              filetypes=[('CSV 日志', '*.csv'), ('所有文件', '*')])
        if filename:
            ensure_app()
            app.sensor_log(filename)
            message.set('温度日志已选择。请在“来源设置”中选定温度列。')
    sensor_buttons = ttk.Frame(frame)
    sensor_buttons.pack(fill='x', pady=(0, 8))
    ttk.Button(sensor_buttons, text='选择 HWiNFO 日志', command=lambda:execute(choose_csv)).pack(side='left')
    def choose_awcc():
        filename = filedialog.askopenfilename(title='选择持续更新的 Alienware 导出 JSON', parent=root,
                                              filetypes=[('JSON 导出', '*.json'), ('所有文件', '*')])
        if filename:
            ensure_app()
            data = app.sensor_export(filename)
            count = len(data.get('sensors', []))
            if count:
                message.set(f'已读取 {count} 个温度传感器。请打开来源设置，按实际设备显示选择 CPU 编号。')
            else:
                message.set('导出路径已保存。' + data.get('message', '等待温度导出更新。'))
    ttk.Button(sensor_buttons, text='选择 Alienware 导出', command=lambda:execute(choose_awcc)).pack(side='left', padx=8)
    managed_row = ttk.Frame(frame)
    managed_row.pack(fill='x', pady=(0, 8))
    sensor_message = tk.StringVar(value='Alienware：点击启用后自动采集；新启动的辅助进程需要管理员授权。')
    monitor_sensor = False
    def enable_awcc():
        nonlocal monitor_sensor
        ensure_app()
        result = app.start_alienware()
        monitor_sensor = True
        sensor_message.set(result['message'])
        message.set('温度来源已自动接入，请打开来源设置并确认CPU传感器编号。')
    ttk.Button(managed_row, text='启用 Alienware 温度采集', command=lambda:execute(enable_awcc)).pack(side='left')
    ttk.Label(frame, textvariable=sensor_message, wraplength=710, justify='left').pack(anchor='w', pady=(0,8))
    def poll_sensor():
        if monitor_sensor and app:
            try:
                value = app.alienware_state()
                if value:
                    sensor_message.set(f'Alienware：{len(value.get("sensors", []))}个温度编号。'+value.get('message',''))
            except Exception:
                sensor_message.set('温度状态暂时不可读，请查看来源设置。')
        root.after(1000, poll_sensor)
    root.after(1000, poll_sensor)
    ttk.Label(frame, textvariable=message, wraplength=660, justify='left').pack(anchor='w', pady=(4, 12))
    ttk.Label(frame, text='数据保存在所选壁纸目录的telemetry-runtime子文件夹。\n最小化可继续采集；退出会停止本程序启动的温度辅助进程。',
              wraplength=660, justify='left').pack(anchor='w')
    lower = ttk.Frame(frame)
    lower.pack(side='bottom', fill='x', pady=(15, 0))
    def stop():
        nonlocal monitor_sensor
        if app:
            app.stop()
        monitor_sensor = False
        sensor_message.set('本程序的温度读取已停止。')
        message.set('采集已停止。点击“配置并启动”可重新开始。')
    ttk.Button(lower, text='停止采集', command=lambda:execute(stop)).pack(side='left')
    ttk.Button(lower, text='最小化继续采集', command=root.iconify).pack(side='left', padx=8)
    def close():
        if app:
            app.close()
        if lock:
            lock.close()
        root.destroy()
    ttk.Button(lower, text='退出', command=close).pack(side='right')
    root.protocol('WM_DELETE_WINDOW', close)
    if not directory.get():
        execute(detect)
    root.mainloop()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-directory', type=Path)
    parser.add_argument('--port', type=int)
    parser.add_argument('--headless', action='store_true')
    parser.add_argument('--run-seconds', type=float, default=0)
    parser.add_argument('--bind', type=Path)
    parser.add_argument('--alienware-export', type=Path)
    parser.add_argument('--diagnostics', type=Path)
    args = parser.parse_args()
    if args.diagnostics:
        import tkinter
        import psutil
        import hashlib
        from worker_integrity import EXPECTED_WORKER_SHA256
        interpreter = tkinter.Tcl()
        worker = Path(__file__).with_name('managed-awcc.ps1')
        args.diagnostics.write_text(json.dumps({'frozen':bool(getattr(sys, 'frozen', False)),
                'pythonVersion':sys.version.split()[0], 'psutilVersion':psutil.__version__,
                'tclVersion':interpreter.eval('info patchlevel'),
                'configurationPageBundled':page_path().is_file(),
                'managedWorkerBundled':worker.is_file(),
                'managedWorkerIntegrity':worker.is_file() and hashlib.sha256(worker.read_bytes()).hexdigest()==EXPECTED_WORKER_SHA256}, indent=2), encoding='utf-8')
        return
    if args.port is not None and not 0 <= args.port <= 65535:
        parser.error('port must be 0..65535')
    data_root = args.data_directory
    if args.headless:
        data_root = data_root or (wallpaper_data_root(args.bind) if args.bind else default_data_root())
        lock = SingleInstance(data_root)
        if lock.already_running:
            lock.close()
            return
        app = Runtime(data_root, page_path(), args.port)
        try:
            app.start()
            if args.alienware_export:
                app.sensor_export(args.alienware_export)
            if args.bind:
                app.bind(args.bind)
            started = time.monotonic()
            while not args.run_seconds or time.monotonic() - started < args.run_seconds:
                time.sleep(.1)
        finally:
            app.close()
            lock.close()
    else:
        gui(data_root, args.port)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        from tkinter import messagebox
        messagebox.showerror('采集器未能启动', traceback.format_exc(limit=3))
        raise
