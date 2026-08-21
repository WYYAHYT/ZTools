# ZTools vNext

ZTools vNext 是一个从零设计的跨平台效率工具与插件平台，目标体验类似 uTools，同时把 Windows、macOS 与 Ubuntu 26.04 GNOME Wayland 作为一等平台。

## 当前状态

**Design Baseline 0.1 已接受，Gate 0 已关闭，Gate 1 已获准开始。** 仓库尚未开始工程实现；首次安装依赖或生成工程骨架前，仍需接受 [三平台工程验证基线](docs/ENGINEERING_BASELINE.md)，固定 Node、pnpm、Electron、CI runner 和目标架构。文档中的 `accepted` 表示设计已经批准，不表示功能已经实现。

本项目不从旧 ZTools 继承架构。旧项目只作为行为、需求、失败经验、兼容数据和测试场景的只读资料来源。

## 设计目标

- 快速、统一的搜索与动作入口。
- 能承载丰富插件能力，同时保持默认安全和可审计。
- 领域核心与 Electron、UI 框架、存储和操作系统实现解耦。
- 通过 Capability 与平台 Adapter 表达差异和受控降级。
- 从第一天正视 Wayland 的授权、Portal 与桌面环境限制。
- 通过类型契约、测试和自动化检查执行架构原则，而不只依赖文档约定。

## 文档入口

- [长期原则](docs/PRINCIPLES.md)
- [愿景](docs/VISION.md)
- [产品边界](docs/PRODUCT.md)
- [术语表](docs/GLOSSARY.md)
- [设计变更流程](docs/DESIGN_PROCESS.md)
- [Baseline 0.1 评审记录](docs/reviews/BASELINE-0.1.md)
- [开放事项与 Gate 阻断关系](docs/OPEN_ITEMS.md)
- [安全模型](docs/SECURITY.md)
- [威胁模型](docs/THREAT_MODEL.md)
- [总体架构](docs/ARCHITECTURE.md)
- [错误、取消与副作用结果模型](docs/ERROR_MODEL.md)
- [插件模型](docs/PLUGIN_MODEL.md)
- [平台能力](docs/PLATFORM_CAPABILITIES.md)
- [平台支持范围](docs/PLATFORM_SUPPORT.md)
- [三平台工程验证基线](docs/ENGINEERING_BASELINE.md)
- [测试策略](docs/TESTING.md)
- [路线图](docs/ROADMAP.md)
- [首个宿主纵向切片验收规格](docs/specs/HOST_VERTICAL_SLICE.md)
- [旧 ZTools 只读行为审计](docs/audits/LEGACY_BEHAVIOR.md)
- [架构决策记录](docs/adr/README.md)

## 已接受的关键范围决策

- 首阶段不运行旧插件，Secure Runtime 不为兼容旧 API 放宽边界，见 [ADR-0006](docs/adr/0006-legacy-plugin-compatibility.md)。
- Ubuntu 采用 Portal/D-Bus 基础路径，并以用户可选的最小化 GNOME Shell 扩展补充完整能力，见 [ADR-0007](docs/adr/0007-gnome-wayland-integration.md)。
- 本地持久化采用 SQLite、插件逻辑命名空间、附件目录与系统密钥库组合，见 [ADR-0008](docs/adr/0008-storage-strategy.md)。

这些决策已经确定设计方向，但在完成相应实现和验证前仍不能标记为 `implemented`。

## 仓库工作方式

开发代理和贡献者必须遵守 [AGENTS.md](AGENTS.md)。任何架构、安全、权限或产品原则变化都先按设计流程处理，再进入实现。
