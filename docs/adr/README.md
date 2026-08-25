# 架构决策记录

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

ADR 记录一项重要决策当时的背景、选择、替代方案和后果。主题设计文档描述当前设计；ADR 保留为什么形成该设计的历史。

## 使用规则

- 新 ADR 从 [TEMPLATE.md](TEMPLATE.md) 复制，使用下一个四位编号。
- Level 2/3 变更必须先创建 `proposed` ADR，批准前不得实现为产品架构。
- `accepted` ADR 原则上不改写决策；新决定通过 `Supersedes` 取代旧 ADR。
- 旧 ADR 被取代后仍保留，并标记 `superseded` 与 `Superseded by`。
- `accepted` 只表示允许据此实现；验证落地后才能标记 `implemented`。
- 状态变更必须由有权决定的一方明确作出，不能因代码已经写出而倒推批准。纯技术决定可以由开发 agent 依据维护者委托权作出；产品方向、费用、外部服务、扩大权限和不可逆影响仍必须由维护者决定。
- ADR 元数据必须记录 Proposed/Accepted 日期、具体 Decider、批准记录、评审者和验证负责人；不能只写泛化角色。
- `Approval record` 优先链接 Issue、PR、评审记录或基线提交。基线提交创建前可以链接仓库内评审记录并明确 `commit pending`，不得伪造外部证据。
- 高风险或可能过时的决策可以设置 `Review by`；没有复审期限时写 `none`。

完整流程见 [DESIGN_PROCESS.md](../DESIGN_PROCESS.md)。

维护者无需理解 ADR 才能参与项目。需要维护者决定时，必须另外按照 [维护者沟通与审批规则](../MAINTAINER_COMMUNICATION.md) 提供普通中文摘要、推荐方案和影响；不得把 ADR 本身当作审批问题。

## 决策索引

| ADR | 标题 | 状态 |
| --- | --- | --- |
| [0001](0001-clean-slate-modular-monolith.md) | 从零建设模块化单体 | accepted |
| [0002](0002-inward-dependency-rule.md) | 领域核心保持技术无关 | accepted |
| [0003](0003-secure-plugin-runtime.md) | 新插件使用默认安全运行时 | accepted |
| [0004](0004-typed-rpc-contracts.md) | 隔离边界使用类型化 RPC 契约 | accepted |
| [0005](0005-platform-capability-adapters.md) | 用 Capability 与 Adapter 隔离平台差异 | accepted |
| [0006](0006-legacy-plugin-compatibility.md) | 首阶段旧插件兼容策略 | accepted |
| [0007](0007-gnome-wayland-integration.md) | GNOME Wayland 完整能力集成策略 | accepted |
| [0008](0008-storage-strategy.md) | 本地持久化与密钥存储策略 | accepted |
| [0009](0009-engineering-technology-stack.md) | 工程技术栈 | accepted |
| [0010](0010-contract-schema-identity-ownership.md) | Contract Schema、连接身份与协议所有权 | accepted |
| [0011](0011-multidimensional-capability-state.md) | Capability 多维状态模型 | accepted |
| [0012](0012-effect-outcome-certainty.md) | 副作用结果确定性模型 | proposed |

## 首批范围决策

ADR-0006、ADR-0007 与 ADR-0008 已由维护者接受。它们确定了首阶段兼容、GNOME Wayland 集成和持久化方向；尚未完成实现与验证，因此不能标记为 `implemented`。

ADR-0009、ADR-0010 与 ADR-0011 源自独立评审指出的 Gate 1 缺口，已由维护者接受。它们允许进入 Gate 1 设计与工程准备，但不代表对应实现已经完成。

ADR-0012 源自进一步评审对 `outcome-unknown` 的语义澄清，在维护者接受前不改变当前 ERROR_MODEL；它阻断 Contract Gateway 结果信封实现。
