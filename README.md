# 莫宁 · 星海观测室

**Wallpaper Engine 动态壁纸 · v0.1.0 · 3440×1440**

让莫宁陪你坐在星海之下。两侧悬浮面板显示电脑状态，频谱随音乐起伏，鼠标移入时窗口柔和停稳、提亮。

[**下载 v0.1.0**](https://github.com/Moral-eddy/wallpaper-design/releases/download/v0.1.0/Mornye-Observatory-v0.1.0.zip) · [版本发布页](https://github.com/Moral-eddy/wallpaper-design/releases/tag/v0.1.0) · [安装指南](docs/INSTALL.md)

![莫宁星海观测室：悬浮窗、悬停高亮与音频响应演示](docs/media/observatory-demo.gif)

*8 秒循环预览，1032×432 / 15fps。读数与频谱为模拟数据，用于展示效果。壁纸交付尺寸为 3440×1440。*

## 这一版可以体验什么

- **14 个悬浮面板**：CPU、GPU、内存、网络、时钟与音频信息围绕观测室排布。
- **轻浮动与悬停高亮**：各窗错相浮动，移入后停稳阅读，移开后恢复。
- **音乐响应**：左右声道频谱、声道强度及低中高频响应跟随系统播放声音。
- **随手调整**：在 Wallpaper Engine 属性面板中控制浮动幅度、亮度、透明度、音频灵敏度和逐窗显隐。
- **三档更新速度**：快速、均衡、节能；可选择完整显示或铺满屏幕。

## 开始使用

1. 下载并解压发行包。
2. 在 Wallpaper Engine 编辑器中以 `wallpaper/index.html` 创建网页壁纸，保存并应用。
3. 在“已安装”页面右侧调整壁纸属性。

如果导入后没有可调属性，按[安装指南](docs/INSTALL.md#导入-wallpaper-engine)复制项目定义并重新打开。

**想看实时读数和音乐响应？** 按[采集器安装步骤](docs/INSTALL.md#启用硬件与音频响应)完成配置。基础场景、时钟、浮动与悬停可独立使用；采集器未连接时，硬件和音频字段显示离线。

## 使用前了解

适用于 Windows + Wallpaper Engine。GPU 读数使用 NVIDIA 驱动接口；CPU 温度需接入 HWiNFO CSV 或支持的 Alienware 传感器。可用字段取决于设备与数据源。

本版人物与背景为静态场景，动态集中在悬浮窗和音频面板。07 / 08 趋势窗固定隐藏；实际帧率受 Wallpaper Engine 设置影响。

[完整安装与来源配置](docs/INSTALL.md) · [更新记录](CHANGELOG.md) · [素材与字体许可](THIRD_PARTY_NOTICES.md)
