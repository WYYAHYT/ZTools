# 平台能力模型

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

## 目的

平台差异通过稳定 Capability 契约表达。业务模块只询问“某种产品能力当前是什么状态、如何调用”，不判断操作系统，也不依赖平台 API。

Capability 代表产品语义，例如“让用户选择一个文件”或“召回主窗口”，而不是 `Win32 API`、`NSWorkspace`、`D-Bus method` 等实现细节。

## 多维能力快照

根据已接受的 [ADR-0011](adr/0011-multidimensional-capability-state.md)，Capability 不使用一个互斥枚举同时表达平台、系统授权、运行故障和插件 Permission。平台快照至少包含四个彼此独立的轴；调用者 Permission 在授权策略中作为第五个轴查询。

| 轴 | 状态 | 含义 |
| --- | --- | --- |
| 实现支持 `implementation` | `supported` / `unsupported` | 当前平台 Adapter 是否实现该产品语义。 |
| 外部依赖 `dependency` | `not-required` / `ready` / `missing` / `disabled` / `incompatible` | Portal、系统服务、Shell 扩展或辅助组件是否满足要求。 |
| 系统授权 `systemAuthorization` | `not-required` / `not-determined` / `granted` / `denied` / `restricted` | 操作系统或桌面环境对宿主应用的授权状态。 |
| 运行健康 `health` | `ready` / `degraded` / `unavailable` | 当前会话中 Adapter 与依赖是否健康；该状态可以短期变化。 |
| 调用者权限 `permission` | `not-applicable` / `not-requested` / `granted` / `denied` / `revoked` | 某一 Host/插件主体是否获准使用能力及具体范围；它不属于平台全局快照。 |

每个非正常轴必须携带稳定原因码、可恢复性、面向用户的恢复动作和可能变化的事件。可以从这些轴派生某次调用的 `readiness`，但派生值不能丢弃原始原因。

示例：扩展已安装但系统授权未授予可表达为 `supported + ready + not-determined + ready`；插件权限被拒绝只改变该插件的 `permission`；系统服务崩溃只把 `health` 改为 `unavailable`，不应把实现支持误报为 `unsupported`。

## Capability 契约

每项能力定义：

- 稳定 ID 和契约版本。
- 产品语义与明确非目标。
- 可接受的 Caller Role。
- 输入、输出和稳定错误 Schema。
- 插件权限及授权范围。
- 实现、外部依赖、平台授权、运行健康、用户交互和前台要求。
- 超时、取消、并发和资源释放语义。
- 可用性探测与状态变化通知。
- 隐私、审计和数据保留要求。
- 各 Adapter 必须通过的共享契约测试。

## Adapter 选择

- 应用启动时由 Composition Root 注册当前平台 Adapter。
- 一个产品 Capability 可以组合多个底层接口，但对上层保持单一语义。
- Adapter 不得把平台对象直接返回给应用层；使用领域值或可撤销逻辑 Handle。
- 探测失败必须返回显式状态，不得静默选择危险降级方案。
- 业务层禁止通过 `process.platform`、桌面环境变量或 Electron 特性检测绕过 Capability Registry。

## 初始能力目录

下表是设计和验证清单，不表示已经实现。具体支持状态以运行时探测和 [平台支持范围](PLATFORM_SUPPORT.md) 为准。

| 能力族 | 产品语义 | Windows 候选实现 | macOS 候选实现 | GNOME Wayland 候选实现 |
| --- | --- | --- | --- | --- |
| Launcher visibility | 召回、隐藏、置前主窗口及报告焦点结果 | Electron + Win32 Adapter | Electron + AppKit Adapter | Electron + Wayland/GNOME 集成；能力可能降级 |
| Global shortcut | 用户配置的系统级召回入口 | 原生全局快捷键 | 原生全局快捷键及系统授权约束 | Desktop Portal 或可选 Shell 扩展；运行时探测 |
| Previous app focus | 隐藏后尽可能回到先前应用 | Win32 窗口/前台语义 | AppKit/Accessibility 受控实现 | 合成器限制明显，可能需要 Shell 扩展或降级 |
| Application discovery | 枚举可启动应用及元数据 | Start Menu/注册信息 Adapter | Launch Services Adapter | `.desktop`/GIO Adapter |
| Application launch | 启动用户选择的应用或 URI | Shell/系统启动 API | Launch Services | GIO/Portal OpenURI |
| File selection | 由用户选择文件或目录 | 系统选择器 | 系统选择器 | FileChooser Portal 优先 |
| File open/reveal | 打开文件、URI 或在管理器定位 | Shell API | Workspace API | OpenURI、FileManager D-Bus 或 Portal |
| Clipboard | 读写明确请求的剪贴板内容 | Electron/原生 Adapter | Electron/原生 Adapter | Wayland 剪贴板；后台读取可能受限 |
| Notifications | 展示系统通知和激活动作 | Windows 通知 | User Notifications | Notification Portal / D-Bus |
| Screen/window capture | 用户授权后取得屏幕或窗口流 | 系统捕获 API | ScreenCaptureKit 与系统授权 | ScreenCast Portal + PipeWire |
| Input automation | 在明确用户动作下执行受限自动化 | 原生权限受控 Adapter | Accessibility 授权 | RemoteDesktop Portal 可提供部分能力；不得绕过授权 |
| Window discovery/control | 查询或操作其他应用窗口 | 受系统规则限制的 Adapter | Accessibility 授权 Adapter | 一般 Wayland 客户端不可用；扩展或明确不支持 |
| Secret storage | 保存宿主或插件机密引用 | Credential Manager | Keychain | Secret Service |
| Login startup | 用户控制的登录时启动 | 系统启动项 | Login Item | XDG autostart 或桌面支持路径 |

候选实现必须经过 Ubuntu 26.04、目标 Electron 版本和真实桌面会话验证后才能升级为发布承诺。

## Wayland 特别约束

- Wayland 客户端通常不能任意枚举、聚焦、定位其他应用窗口，也不能无授权地注入全局输入。
- Portal 返回的选择和会话由用户与桌面环境控制；取消和拒绝属于正常结果。
- Portal 请求必须关联可用的父窗口标识，并正确处理异步 Response、超时和宿主退出。
- PipeWire 流、RemoteDesktop 会话和恢复令牌都有明确所有者与清理路径。
- GNOME Shell 扩展不能被静默安装，不能获得超出声明用途的接口。

根据 [ADR-0007](adr/0007-gnome-wayland-integration.md)，标准接口无法安全提供且用户价值足够高的能力可以由官方、可选、职责最小的 GNOME Shell 扩展补充；没有扩展时必须显式降级。

## 插件可见性

插件可以查询与其声明相关的抽象状态和稳定原因码，但不能获得无关系统指纹。调用流程仍需逐次验证插件身份和 Permission；平台各轴均正常也不等于插件有权调用，插件 Permission 已授予也不能覆盖系统授权撤销或依赖故障。

## 测试策略

- 每个 Adapter 运行同一套契约测试。
- 对拒绝、取消、超时、依赖缺失、权限撤销和会话中断使用可控 Fake Adapter。
- 平台集成测试在真实 Windows、macOS、Ubuntu 26.04 GNOME Wayland CI 或发布门禁环境执行。
- 任何平台特例必须以契约测试证明没有改变上层产品语义。
