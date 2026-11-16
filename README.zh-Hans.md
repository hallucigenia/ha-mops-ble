# MOPS BLE：Home Assistant 忻风 PM2.5 集成

[English](README.md)

复用 HA 原生 Bluetooth 和既有 ESPHome 主动蓝牙代理，不需要原厂 App、账号、
云服务、MQTT 或刷机。作者署名为 [hallucigenia](https://github.com/hallucigenia)。
这是非官方社区集成，与 MOPS、Home Assistant 厂商或项目没有隶属关系。

**非商业源码公开**：采用 [PolyForm Noncommercial 1.0.0](LICENSE)，允许非商业
使用、修改及分享，须保留 Required Notice 作者署名和许可条款。本许可不授予商业
使用权，不属于 OSI 定义的开源许可。第三方参考材料仍遵循各自许可，详见
[来源与声明](THIRD_PARTY_NOTICES.md)。许可原文还列出了允许的非商业机构用途，
以原文为准。

## 已验证范围

- 设备：MOPS AD520-P001；固件：1.12。
- Home Assistant Core：2026.11.1；传输：ESPHome 主动蓝牙代理。
- 其他固件、相近 AD520 型号及直连适配器尚待实机反馈，不作兼容性承诺。
- `1.0.1b1` 为首个公开测试版；最低 HA 版本按已验证版本设置。

## 安装与配置

1. 在 HACS 的「自定义存储库」添加 `https://github.com/hallucigenia/ha-mops-ble`，
   类型选择「集成」，下载 MOPS PM2.5 Monitor 后重启 HA。该方式不代表已进入默认商店。
2. 也可手动将仓库的 `custom_components/mops_ble` 完整复制到 HA 配置目录中的
   `custom_components/`，保留许可文件并重启；最终应存在
   `custom_components/mops_ble/manifest.json`。
3. 启用 HA Bluetooth。ESPHome 代理需启用 `bluetooth_proxy.active: true` 且有空闲
   连接名额。检测仪通电并靠近代理，关闭正在连接它的手机 App。
4. 在「设置 → 设备与服务」确认自动发现的设备，或「添加集成」搜索 MOPS PM2.5
   Monitor，选择可见设备。手动输入地址也须通过广播匹配检查，无需 YAML。
5. 房间由使用者在设备页指定；实体 ID 由 HA 自动生成。

初始化只同步设备时钟，保留设备当前采样模式与间隔。每台检测仪持续占用一个蓝牙
连接名额；代理的配置及凭据由 HA 管理。

## 功能与限制

提供六类实体：PM2.5（µg/m³，支持统计）、电量、充电状态、最近测量时间、分时检测
开关和检测间隔。开关控制分时检测，不能代替整机电源；间隔可选 10、15、30、60、
90、120 分钟。固件 1.12 拒绝 5 分钟设置，因此不提供该选项。

设置命令须由新的完整设置上报确认，GATT 写入成功或 ACK 不能单独确认成功；未确认
的控制命令不会自动重发。重复推送不会产生新采样，旧历史与 ACK 不覆盖实时数据。
蓝牙遥测中断 90 秒后数据失效；PM2.5 也会在采样间隔加 90 秒后失效，最低有效期
180 秒。每 30 秒检查一次，因此界面可能延后一个检查周期；不可用时不填零。

发现或连接失败时，先检查距离、代理主动连接功能、空闲连接名额和手机是否占用连接。
没有新 PM2.5 时检查检测仪的模式与间隔；频繁状态包不等于新采样。删除集成时先在
「设置 → 设备与服务」移除，再从 HACS 卸载，或删除组件目录后重启。

## 反馈、贡献与隐私

持续接收 [Issues](https://github.com/hallucigenia/ha-mops-ble/issues)、
[PR](https://github.com/hallucigenia/ha-mops-ble/pulls) 和兼容性报告。请提供型号、
固件、HA 与集成版本、传输类型、预期与实际行为；贡献按项目相同许可提交，并保留
贡献者自己的署名。

不要公开完整备份、真实 MAC、家庭地址或房间截图、访问令牌、代理密钥及内网域名。
集成专属诊断仅导出版本、设置、电量、充电与连接状态及相对时间；分享前仍需检查
HA 附带的通用诊断元数据。详见 [隐私说明](PRIVACY.md) 和
[贡献指南](CONTRIBUTING.md)。

离线检查在仓库根目录执行，无需连接家庭 HA：

```sh
python3 -B -m unittest discover -s tests -v
python3 scripts/check_package.py
python3 scripts/privacy_check.py --history
```

协议和传输测试使用合成报文与桩对象；HA 实际加载和不同硬件仍需独立验证。
