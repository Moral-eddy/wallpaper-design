# 莫宁 · 星海观测室

**Wallpaper Engine 动态壁纸 · v0.1.2 · 3440×1440**

让莫宁陪你坐在星海之下。两侧悬浮面板显示电脑状态，声痕随音乐起伏，鼠标移入时窗口柔和停稳、提亮。

[**创意工坊订阅**](https://steamcommunity.com/sharedfiles/filedetails/?id=3817553402) · [**下载采集器 EXE（Windows 64 位）**](https://github.com/Moral-eddy/wallpaper-design/releases/download/v0.1.2/Mornye-Telemetry-v0.1.2-win64.zip) · [完整发行包](https://github.com/Moral-eddy/wallpaper-design/releases/download/v0.1.2/Mornye-Observatory-v0.1.2.zip) · [安装指南](docs/INSTALL.md)

![莫宁星海观测室：声痕、音乐响应、浮动与悬停演示](docs/media/observatory-demo-v0.1.1.gif)

*壁纸画面演示：v0.1.1，8 秒循环，1032×432 / 15fps。读数与音频均为模拟输入；壁纸交付尺寸为 3440×1440。v0.1.2 的主要更新是采集器 EXE 和配置流程，沿用画面与音频动效。*

## 可以体验什么

- **14 个悬浮面板**：CPU、GPU、内存、网络、时钟与音频信息围绕观测室排布。
- **轻浮动与悬停高亮**：各窗错相浮动，移入后停稳阅读，移开后恢复。
- **原生音乐响应**：对称声痕、左右声道和低中高频响应使用 Wallpaper Engine 官方音频；静音时声痕回到水平线。
- **可调属性**：浮动幅度、亮度、透明度、音频灵敏度、更新速度、适屏及逐窗显隐。
- **独立采集器 EXE**：无需安装 Python；自动查找订阅目录，生成连接配置，提供实时硬件数据。
- **Alienware 温度入口**：点击启用并确认管理员授权后，启动内置只读温度辅助采集；已有本项目的温度采集可以自动接入。

## 开始使用

1. 在创意工坊订阅并应用壁纸。时间、日期、音乐与动效可以直接使用。
2. 想看硬件读数时，下载采集器 ZIP，解压并双击 `Mornye-Telemetry.exe`。
3. 确认实际订阅目录，点击“配置并启动”，然后重新加载壁纸。
4. Alienware 设备需要温度时，点击“启用 Alienware 温度采集”，再在来源页按设备显示确认 CPU 编号。

**音乐响应不需要采集器。** 硬件未连接或字段不支持时显示缺失。GPU 当前使用 NVIDIA 驱动接口；CPU 温度需要支持的 Alienware 接口，或持续更新的 HWiNFO CSV。

程序数据保存在壁纸目录的 `telemetry-runtime` 子文件夹。保持 EXE 运行可持续采集，最小化不会退出；本版手动启动，不登记登录任务。Steam 更新若清理配置，需再次配置连接。

也可下载完整包，以其中 `wallpaper/index.html` 手动导入网页壁纸，按[安装指南](docs/INSTALL.md)恢复原生属性。

[完整安装指南](docs/INSTALL.md) · [版本记录](CHANGELOG.md) · [采集器源码与构建](companion/README.md) · [素材与依赖许可](THIRD_PARTY_NOTICES.md)
