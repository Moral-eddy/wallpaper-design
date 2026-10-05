# 安装指南

## 导入 Wallpaper Engine

1. 下载 Release 中的 `Mornye-Observatory-v0.1.0.zip` 并解压，或下载仓库源码。
2. 在 Wallpaper Engine 编辑器中以 `wallpaper/index.html` 创建网页壁纸。
3. 如果编辑器重建了项目定义，关闭该项目编辑器，将包内 `wallpaper/project.json` 复制到新项目目录，再重新打开、保存和应用。
4. 在“已安装”页面选中壁纸，使用右侧属性面板调整设置。

也可将 `wallpaper` 的内容复制到自己创建的本地网页项目目录。基础场景、时钟、浮动和悬停可以独立运行。硬件与音频数据需要下方的可选采集器；没有连接时显示 `—` 或离线状态。

## 壁纸属性

| 设置 | 默认值 / 范围 |
| --- | --- |
| 轻浮动 | 开启；幅度 150%，可调 0–250% |
| 鼠标悬停高亮 | 开启 |
| 窗口亮度 | 100%，可调 30–180% |
| 窗口不透明度 | 100%，可调 10–100% |
| 音频频谱与响应 | 开启；灵敏度 100%，可调 25–250% |
| 更新档位 | 快速 250ms / 60fps；均衡 500ms / 30fps；节能 1000ms / 20fps |
| 适屏方式 | 完整显示，或铺满屏幕并裁边 |
| 各窗口显隐 | 展开逐窗选项后可独立控制 14 窗 |

07 CPU 趋势窗与 08 GPU 趋势窗固定隐藏。更新档位调整页面请求间隔与动画上限；采集器硬件周期为 250ms。实际帧率也受 Wallpaper Engine 总帧率设置影响。

## 启用硬件与音频响应

需要 Windows 和 Python。依赖按 `telemetry/requirements.txt` 安装。NVIDIA GPU 字段通过 NVML 读取；未支持的字段显示缺失。CPU 温度可使用 HWiNFO CSV 日志，或可选的 Alienware 固件读取器。

在解压目录打开 PowerShell：

```powershell
python -m venv telemetry/.venv
./telemetry/.venv/Scripts/python.exe -m pip install -r telemetry/requirements.txt
./setup-telemetry.ps1
./telemetry/start-live.ps1
```

如果壁纸已被导入其他目录，在启动前用实际的项目目录生成配置：

```powershell
$wallpaperDirectory = Read-Host '请输入你的 Wallpaper Engine 网页项目目录'
./setup-telemetry.ps1 -WallpaperDirectory $wallpaperDirectory
```

配置脚本为本次安装生成随机读取密钥，写入 `telemetry/read-access.json` 和目标壁纸目录的 `telemetry-config.local.js`。这些文件不随版本发布，也被 Git 忽略。重新生成或迁移配置后，重新打开壁纸项目。

采集器仅监听通用回环地址 `127.0.0.1:64582`。每次安装会读取使用者当前设备的数据；仓库不附带个人硬件清单、实时读数、网卡选择、设备标识或传感器映射。若端口已被另一实例占用，关闭那个实例后再启动本版采集器。

采集器运行时，在浏览器打开 [采集配置页](http://127.0.0.1:64582/configure.html)，选择网卡、CPU 温度来源和传感器。HWiNFO 日志默认位置是 `telemetry/sensor-input/HWiNFO.csv`；也可在运行 `setup-telemetry.ps1` 时传入 `-SensorLog`，指定自己正在持续写入的 CSV。温度来源停止更新后显示过期状态。

音频采集使用 Windows 默认播放设备的 WASAPI 回环，读取系统正在播放的声音。频谱和声道、频段响应采用相对显示刻度。

如需在登录后自动恢复普通采集器，可主动登记当前用户启动项：

```powershell
./telemetry/.venv/Scripts/python.exe telemetry/startup.py install
```

移除时将 `install` 改为 `uninstall`。安装不会自动登记启动项。

## 可选 Alienware 温度与风扇

`telemetry/awcc-sensors.ps1` 适用于提供 AWCC WMI 接口的设备。它按设备实际枚举的编号读取温度及转速，不预设 CPU / GPU 对应关系。可在管理员 PowerShell 中，从本项目目录运行：

```powershell
$sensorOutput = Join-Path (Get-Location).Path 'telemetry/sensor-input/alienware-live.json'
./telemetry/awcc-sensors.ps1 -OutputPath $sensorOutput
```

如果 HWiNFO CSV 设在其他目录，请将导出文件放到该 CSV 的同一目录并命名为 `alienware-live.json`。之后在采集配置页按实际设备显示选择 CPU 温度编号。该读取器约每 2 秒更新；本版未附带管理员计划任务安装器。


[返回发布首页](../README.md)
