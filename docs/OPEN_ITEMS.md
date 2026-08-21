# 开放事项与 Gate 阻断关系

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

本文件是尚未完成的设计、决策和治理交付物的统一登记。它不代替对应文档；各 Gate 开始前必须检查本表，不能只依赖全文搜索。

“设计状态”使用 `draft`、`proposed`、`accepted`、`implemented`、`deprecated` 或 `superseded`；尚未创建的交付物使用 `—`，不能提前宣称为 draft。“执行进度”使用 `not-started`、`researching`、`validation-pending`、`in-progress`、`verified`、`completed` 或 `deferred`。设计获批不等于工作完成，执行完成也不能倒推设计已批准。

Gate 1 当前责任分配：Accountable/Implementation owner、Engineering baseline verification owner、Contract Gateway verification owner 与 Security review owner 均为 `zhangchonghao`。Codex 可以执行、分析和辅助评审，但不是长期责任主体。

| 决策或交付物 | 最迟完成时间 | 设计状态 | 执行进度 | Accountable owner | Verification owner | 阻断事项 |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline 0.1 最终评审与首个提交 | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed；baseline `3a5ad77` |
| `PRODUCT.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| `ROADMAP.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| `ARCHITECTURE.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| `PLATFORM_CAPABILITIES.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| ADR-0009 工程技术栈 | 正式工程骨架前 | accepted | validation-pending | zhangchonghao | zhangchonghao | 精确版本与平台证据由工程基线阻断 |
| ADR-0010 Contract、身份绑定与协议所有权 | Contract Gateway 实现前 | accepted | validation-pending | zhangchonghao | zhangchonghao | Gate 1 Gateway 切片与实施验证 |
| ADR-0011 Capability 多维状态 | Capability Registry 实现前 | accepted | validation-pending | zhangchonghao | zhangchonghao | Capability Contract 实施验证 |
| ADR-0012 副作用结果确定性模型 | Contract Gateway 实现前 | proposed | not-started | zhangchonghao | zhangchonghao | ERROR_MODEL 与 Gateway 结果 Schema |
| `ERROR_MODEL.md` | Contract Gateway 实现前 | accepted | validation-pending | zhangchonghao | zhangchonghao | ADR-0012 与三个纸面例证 |
| `ENGINEERING_BASELINE.md` 三平台工程验证基线 | 正式工程骨架前 | draft | researching | zhangchonghao | zhangchonghao | 正式 workspace、锁文件、产品依赖与 CI workflow |
| 可丢弃工具链验证原型流程 | 工程基线接受前 | accepted | not-started | zhangchonghao | zhangchonghao | 原型执行需单独授权；只生成工程基线证据 |
| `threat-model/GATE1_HOST_GATEWAY.md` | Contract Gateway 实现前 | draft | in-progress | zhangchonghao | zhangchonghao | Host Bridge 与 Contract Gateway 实现 |
| 架构边界自动检查规则 | Gate 1 退出前 | accepted | not-started | zhangchonghao | zhangchonghao | Gate 1 退出 |
| `specs/HOST_VERTICAL_SLICE.md` | Gate 2 实现前 | draft | not-started | zhangchonghao | unassigned | Gate 2 |
| `audits/LEGACY_BEHAVIOR.md` | Gate 2 实现前 | draft | not-started | zhangchonghao | unassigned | Gate 2 范围确认 |
| `PERMISSION_UX.md` | Gate 3 实现前 | — | not-started | zhangchonghao | unassigned | 敏感插件能力 |
| `DATA_OWNERSHIP.md` | Gate 3 实现前 | — | not-started | zhangchonghao | unassigned | 插件存储、卸载与迁移 |
| `COMPATIBILITY.md` | Gate 3 实现前 | — | not-started | zhangchonghao | unassigned | 首个公开插件协议 |
| 插件生命周期状态机 | Gate 3 实现前 | — | not-started | zhangchonghao | unassigned | Plugin Worker/UI 生命周期 |
| 权限请求状态机 | 首个敏感 Capability 前 | — | not-started | zhangchonghao | unassigned | 权限调用与撤销 |
| Portal 会话状态机 | 首个 Portal Capability 前 | — | not-started | zhangchonghao | unassigned | Portal 资源与取消 |
| Secure Plugin 数据流威胁模型 | Gate 3 实现前 | — | not-started | zhangchonghao | unassigned | 插件安装、升级、运行和卸载 |
| 网络访问方式 ADR 与 SSRF 控制 | 首个插件网络能力前 | — | not-started | zhangchonghao | unassigned | 插件网络能力 |
| 插件包签名、来源与降级攻击模型 | 插件分发实现前 | — | not-started | zhangchonghao | unassigned | 市场、更新和分发 |
| `MIGRATIONS.md` | Gate 5 发布准备前 | — | not-started | zhangchonghao | unassigned | Preview 数据升级 |
| `PRIVACY.md` | Gate 5 发布准备前 | — | not-started | zhangchonghao | unassigned | Preview 发布 |
| `OBSERVABILITY.md` | Gate 5 发布准备前 | — | not-started | zhangchonghao | unassigned | 诊断和遥测发布 |
| `PLUGIN_DISTRIBUTION.md` | Gate 5 发布准备前 | — | not-started | zhangchonghao | unassigned | 插件市场/分发 |
| `RELEASE_PROCESS.md` | 首个 Preview 前 | — | not-started | zhangchonghao | unassigned | Preview 发布 |
| `SUPPORT_POLICY.md` | 首个 Preview 前 | — | not-started | zhangchonghao | unassigned | 公开平台承诺 |
| `CONTRIBUTING.md` | 开放外部贡献前 | — | not-started | zhangchonghao | unassigned | 外部贡献流程 |

## 维护规则

- 新发现的设计前置项必须登记最迟完成 Gate、负责人和阻断对象。
- 进入某个 Gate 前，所有阻断该 Gate 的事项必须达到要求状态，或由维护者通过 ADR 明确延后。
- `accepted` 只说明设计允许实施；只有可执行验证完成后才改为 `implemented`。
- 不得用 `unassigned` 跨过对应 Gate；开始相应工作前必须落实到具体人员。
- 完成或延后事项时同步更新本表、ROADMAP 和对应文档，避免三者漂移。
