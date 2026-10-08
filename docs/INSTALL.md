# 安装指南

## 导入 Wallpaper Engine

1. 下载 Release 中的 `Mornye-Observatory-v0.1.1.zip` 并解压，或下载仓库源码。
2. 在 Wallpaper Engine 编辑器中以 `wallpaper/index.html` 创建网页壁纸。
3. 如果编辑器重建了项目定义，关闭该项目编辑器，将包内 `wallpaper/project.json` 复制到新项目目录，再重新打开、保存和应用。
4. 在“已安装”页面选中壁纸，使用右侧属性面板调整设置。

也可将 `wallpaper` 的内容复制到自己创建的本地网页项目目录。基础场景、时钟、浮动和悬停可以独立运行。Wallpaper Engine 内的音乐响应使用官方音频输入，无需额外采集器；硬件读数需要下方的可选采集器，没有连接时显示 `—` 或离线状态。

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

## 启用原生音乐响应

在 Wallpaper Engine 设置中启用音频录制，并保持壁纸属性“音频频谱与响应”开启。播放声音后，由官方音频回调驱动声痕、左右声道和三频段显示。

原生接口提供左右各64个频段；低/中/高按0–15、16–39、40–63分组。数字采用0–1视觉响应，不代表PCM、dB或精确Hz。15号声痕居中433px，静音时收为水平线，两侧显示PEAK BIN与CENTROID频段索引分析。

## 启用硬件读数

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

浏览器预览的备用音频使用 Windows 默认播放设备的 WASAPI 回环。Wallpaper Engine 中使用原生输入，不请求采集器音频接口；可选采集器仍包含浏览器备用音频依赖。

如需登录启动和进程中断后的自动恢复，可主动登记当前用户、普通权限的 Windows 计划任务：

```powershell
./telemetry/.venv/Scripts/python.exe telemetry/startup.py install
```

移除时将 `install` 改为 `uninstall`。只执行配置脚本不会登记任务；执行 `startup.py install` 会登记并启动任务。登录后延迟15秒启动，每分钟补启动，已有实例继续运行；任务不设运行时限，在电池供电时继续运行。守护进程在子进程退出后重试；端口占用时等待30秒，不结束端口占用者。

普通日志每个文件达到2MiB前轮换，保留当前与上一份，host与采集器合计预算8MiB。致命错误日志在host启动时按128KiB阈值轮换，单次崩溃转储可能超出该阈值；状态JSON覆盖写入。

## 可选 Alienware 温度与风扇

`telemetry/awcc-sensors.ps1` 适用于提供 AWCC WMI 接口的设备。它按设备实际枚举的编号读取温度及转速，不预设 CPU / GPU 对应关系。可在管理员 PowerShell 中，从本项目目录运行：

```powershell
$sensorOutput = Join-Path (Get-Location).Path 'telemetry/sensor-input/alienware-live.json'
./telemetry/awcc-sensors.ps1 -OutputPath $sensorOutput
```

如果 HWiNFO CSV 设在其他目录，请将导出文件放到该 CSV 的同一目录并命名为 `alienware-live.json`。之后在采集配置页按实际设备显示选择 CPU 温度编号。该读取器约每 2 秒更新；本版未附带管理员计划任务安装器。


[返回发布首页](../README.md)

## 从 v0.1.0 升级

- 先保存旧目录和壁纸属性。在已导入的网页项目中更新v0.1.1壁纸文件；旧版已有的`telemetry-config.local.js`由使用者保留，发行包不提供这个文件。
- v0.1.1的`project.json`包含原生音频声明和默认属性。若已有创意工坊项目，保留其已有`workshopid`及需要的自定义设置；更新后重新打开编辑器、保存并应用。尺寸、窗口布局和属性键沿用v0.1.0。
- 音乐响应无需迁移采集器。若升级硬件采集器，先结束自己启动的旧采集器；同目录替换`runtime-host.py`、`startup.py`、`serve.py`并加入`install-telemetry-task.ps1`。保留`read-access.json`、`local-machine.json`、`user-settings.json`和`sensor-input`。
- 若安装目录改变，先在旧目录执行`startup.py uninstall`，再为新壁纸目录运行`setup-telemetry.ps1 -WallpaperDirectory`，最后按需登记新任务。若Python环境改变，先用旧环境移除旧登录启动项，再用新环境登记。
- 新任务登记仅迁移与当前目录及Python环境完全一致的旧登录项；遇到其他安装的同名登录项会停止，避免覆盖其他安装。

新版真实音频、属性保存、硬件读数、任务恢复和日志轮换均待使用者人眼检验。
