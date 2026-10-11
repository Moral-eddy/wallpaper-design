# 独立采集器源码

普通用户直接下载Release中的Windows64 EXE包，不需要Python。

## 构建

本次构建使用Windows64 Python3.12。此目录包含主程序、HTTP服务、只读硬件逻辑及内置AWCC辅助脚本。

```powershell
python --version
python -m venv .build-env
./.build-env/Scripts/python.exe -m pip install -r build-requirements.txt
./build.ps1
```

输出为`dist/Mornye-Telemetry.exe`。构建脚本按当前资源字节重新生成worker_integrity.py，兼容Git检出/源码ZIP的换行差异；运行时只提升该已打包资源的权限，不运行用户提供的脚本。

```powershell
./.build-env/Scripts/python.exe -m unittest discover -s tests -v
```

测试只使用临时目录、端口和模拟管理员启动器，不触发UAC或实际固件读取。GUI及视觉验收由用户完成。

主程序普通权限。点击温度启用时，通过系统PowerShell和Windows runas/UAC启动只读辅助；它用共享互斥、独立停止信号和心跳租约管理本次采集。数据默认位于选择的壁纸目录telemetry-runtime。

## 旧Python采集器

仓库`telemetry/`和`setup-telemetry.ps1`保留v0.1.1的源码安装路径。其固定依赖的Windows完整预编译包路径为Python3.10；`telemetry/startup.py`登记的旧任务和独立EXE是不同运行方式。本版普通用户教程以EXE为入口，不自动迁移旧任务。
