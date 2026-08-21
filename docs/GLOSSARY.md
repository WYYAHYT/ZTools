# 术语表

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

| 术语 | 定义 |
| --- | --- |
| Host（宿主） | ZTools 可信应用本体，包括主进程、可信 Host UI 和应用服务。 |
| Host UI | 搜索、设置、市场、账号、权限中心等可信界面；不是插件。 |
| Plugin（插件） | 由清单、贡献声明、UI/Worker 代码和资源组成的扩展单元，默认不可信。 |
| Plugin UI | 插件提供的沙箱化交互界面，不具备 Node.js、Electron 或裸 IPC 访问。 |
| Plugin Worker | 与插件 UI 生命周期分离的后台执行单元，受能力、时间和资源配额约束。 |
| Secure Runtime | 运行新插件的默认安全运行环境及其桥接、权限和资源管理机制。 |
| Legacy Runtime | 未来可能提供的旧插件兼容环境；即使存在，也必须位于 Secure Runtime 边界之外并清晰标识风险。 |
| Capability（能力） | 对某项宿主或平台功能的稳定、类型化产品语义；其快照分别描述实现支持、外部依赖、系统授权与运行健康。 |
| Permission（权限） | 用户或策略授予特定主体使用某项 Capability 的许可。它是主体相关状态，不属于平台 Capability 快照；能力存在、系统已授权也不等于插件已获准。 |
| Application Port | 应用用例消费并拥有的外部能力接口，由外层 Adapter 实现。 |
| Public Module Contract | 某模块向其他模块公开并拥有的应用接口或事件 Schema；不等于跨进程 RPC，也不得暴露模块私有状态。 |
| RPC Contract | 跨进程或隔离域的可序列化协议 Schema，由暴露端点的边界拥有并映射到应用用例。 |
| Adapter（适配器） | 在外层把稳定 Capability 契约映射到 Electron、操作系统、Portal 或桌面环境实现。 |
| Contract（契约） | 跨模块或跨进程的版本化类型、Schema、错误、超时、取消和身份规则。 |
| RPC | 依据 Contract 进行的跨进程或跨隔离域请求/响应通信，不指 Electron 裸 IPC。 |
| Caller Role（调用者角色） | 发起 RPC 的可信身份类别，例如 Host UI、Plugin UI、Plugin Worker 或 Platform Helper。 |
| Portal | Linux 桌面环境提供的授权型跨桌面接口，通常经 D-Bus 调用并展示系统授权 UI。 |
| Platform Helper | 可选的、职责极窄的平台辅助进程或组件，用于主运行时不适合承担的系统集成。 |
| GNOME Shell Extension | 用户显式安装和启用的 GNOME Shell 扩展，可在 Shell 授权范围内补充 Wayland 能力。 |
| Degraded（降级） | 产品仍可工作，但某能力受限，并向用户或调用方明确说明原因和替代路径。 |
| Vertical Slice（纵向切片） | 从 UI、应用服务、契约、平台/基础设施到测试完整贯通的一小段用户价值。 |
| Design Baseline | 某一时点被接受的原则、设计和 ADR 集合；不等于实现完成。 |
| ADR | Architecture Decision Record，记录决策背景、选择、后果和取代关系。 |
