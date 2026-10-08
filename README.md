# 莫宁 · 星海观测室

**Wallpaper Engine 动态壁纸 · v0.1.1 · 3440×1440**

让莫宁陪你坐在星海之下。两侧悬浮面板显示电脑状态，声痕随音乐起伏，鼠标移入时窗口柔和停稳、提亮。

[**下载 v0.1.1**](https://github.com/Moral-eddy/wallpaper-design/releases/download/v0.1.1/Mornye-Observatory-v0.1.1.zip) · [版本发布页](https://github.com/Moral-eddy/wallpaper-design/releases/tag/v0.1.1) · [安装指南](docs/INSTALL.md)

![莫宁星海观测室：悬浮窗、悬停高亮与音频响应演示](docs/media/observatory-demo.gif)

*保留的 v0.1.0 演示：8 秒循环，1032×432 / 15fps，读数与频谱为模拟数据。v0.1.1 已将主频谱改为声痕，以上动图不展示本次音频更新。壁纸交付尺寸为 3440×1440。*

## 这一版可以体验什么

- **14 个悬浮面板**：CPU、GPU、内存、网络、时钟与音频信息围绕观测室排布。
- **轻浮动与悬停高亮**：各窗错相浮动，移入后停稳阅读，移开后恢复。
- **原生音乐响应**：433px 对称声痕、左右声道及低中高频响应使用 Wallpaper Engine 官方音频输入，无需额外音频采集器；静音时声痕回到水平线。
- **随手调整**：在 Wallpaper Engine 属性面板中控制浮动幅度、亮度、透明度、音频灵敏度和逐窗显隐。
- **三档更新速度**：快速、均衡、节能；可选择完整显示或铺满屏幕。

## 开始使用

1. 下载并解压发行包。
2. 在 Wallpaper Engine 编辑器中以 `wallpaper/index.html` 创建网页壁纸，保存并应用。
3. 在“已安装”页面右侧调整壁纸属性。

如果导入后没有可调属性，按[安装指南](docs/INSTALL.md#导入-wallpaper-engine)复制项目定义并重新打开。

**音乐响应可直接使用。** 在 Wallpaper Engine 中启用音频录制，并播放声音。

**想看实时硬件读数？** 按[硬件采集器安装步骤](docs/INSTALL.md#启用硬件读数)完成配置。场景、时钟、浮动、悬停和原生音频可独立使用；采集器未连接时，硬件字段显示离线。

从 v0.1.0 升级见[升级说明](docs/INSTALL.md#从-v010-升级)。

## 使用前了解

适用于 Windows + Wallpaper Engine。GPU 读数使用 NVIDIA 驱动接口；CPU 温度需接入 HWiNFO CSV 或支持的 Alienware 传感器。可用字段取决于设备与数据源。

[完整安装与来源配置](docs/INSTALL.md) · [更新记录](CHANGELOG.md) · [素材与字体许可](THIRD_PARTY_NOTICES.md)
