莫宁 · 星海观测室 v0.1.2：无需安装 Python 的硬件采集器 EXE。

- 双击运行、自动查找订阅目录、生成连接配置，支持端口避让。
- EXE内启用Alienware温度辅助采集：用户确认管理员授权后自动接入；已有采集可自动复用。
- 程序数据默认放在壁纸目录telemetry-runtime，新增温度来源提示与独立路径保存。
- 沿用v0.1.1壁纸画面、原生音乐响应及可调属性；音乐无需采集器。

创意工坊用户下载 `Mornye-Telemetry-v0.1.2-win64.zip`。需要手动导入壁纸时，下载 `Mornye-Observatory-v0.1.2.zip`，其中也包含EXE。

GPU当前使用NVIDIA接口；CPU温度需支持的Alienware接口或HWiNFO持续CSV。主程序普通权限，仅温度辅助采集需UAC。程序保持运行才提供读数，本版不登记登录任务；当前EXE未签名。

候选5的本机试用已获用户确认。非视觉技术检查已完成，尚未覆盖所有设备或Steam更新保留情况。安装步骤见仓库 docs/INSTALL.md。
