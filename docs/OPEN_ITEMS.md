# 开放事项与 Gate 阻断关系

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

本文件是尚未完成的设计、决策和治理交付物的统一登记。它不代替对应文档；各 Gate 开始前必须检查本表，不能只依赖全文搜索。

状态使用 `not-started`、`draft`、`proposed`、`accepted`、`implemented` 或 `deferred`。负责人中的“Gate implementation owner”在进入对应 Gate 时必须替换为具体人员。

| 决策或交付物 | 最迟完成时间 | 当前状态 | 负责人 | 阻断事项 |
| --- | --- | --- | --- | --- |
| Baseline 0.1 最终评审与首个提交 | Gate 1 前 | accepted；commit recording in progress | zhangchonghao | 整个 Gate 1 |
| `PRODUCT.md` 最终接受 | Gate 1 前 | accepted | zhangchonghao | completed |
| `ROADMAP.md` 最终接受 | Gate 1 前 | accepted | zhangchonghao | completed |
| `ARCHITECTURE.md` 修订稿最终接受 | Gate 1 前 | accepted | zhangchonghao | completed |
| `PLATFORM_CAPABILITIES.md` 修订稿最终接受 | Gate 1 前 | accepted | zhangchonghao | completed |
| ADR-0009 工程技术栈 | Gate 1 实现前 | accepted | zhangchonghao；验证负责人为 Gate 1 implementation owner | completed；精确版本仍由工程基线阻断 |
| ADR-0010 Contract、身份绑定与协议所有权 | Gate 1 实现前 | accepted | zhangchonghao；验证负责人为 Gate 1 implementation owner | completed |
| ADR-0011 Capability 多维状态 | Gate 1 实现前 | accepted | zhangchonghao；验证负责人为 Gate 1 implementation owner | completed |
| `ERROR_MODEL.md` | Gate 1 实现前 | accepted | Gate 1 implementation owner | completed |
| `ENGINEERING_BASELINE.md` 三平台工程验证基线 | Gate 1 实现前 | draft | Gate 1 implementation owner | CI workflow、Electron 版本与打包目标 |
| 架构边界自动检查规则 | Gate 1 退出前 | not-started | Gate 1 implementation owner | Gate 1 退出 |
| `specs/HOST_VERTICAL_SLICE.md` 首个宿主纵向切片验收规格 | Gate 2 实现前 | not-started | zhangchonghao + Gate 2 implementation owner | Gate 2 |
| `audits/LEGACY_BEHAVIOR.md` 旧项目只读行为审计 | Gate 2 实现前 | not-started | Gate 2 implementation owner | Gate 2 范围确认 |
| `PERMISSION_UX.md` | Gate 3 实现前 | not-started | zhangchonghao + Gate 3 implementation owner | 敏感插件能力 |
| `DATA_OWNERSHIP.md` | Gate 3 实现前 | not-started | Gate 3 implementation owner | 插件存储、卸载与迁移 |
| `COMPATIBILITY.md` | Gate 3 实现前 | not-started | Gate 3 implementation owner | 首个公开插件协议 |
| 插件生命周期状态机 | Gate 3 实现前 | not-started | Gate 3 implementation owner | Plugin Worker/UI 生命周期 |
| 权限请求状态机 | 首个敏感 Capability 前 | not-started | Gate 3/4 implementation owner | 权限调用与撤销 |
| Portal 会话状态机 | 首个 Portal Capability 前 | not-started | Gate 4 implementation owner | Portal 资源与取消 |
| Secure Plugin 数据流威胁模型 | Gate 3 实现前 | draft scaffold | Security review owner 待分配 | 插件安装、升级、运行和卸载 |
| 网络访问方式 ADR 与 SSRF 控制 | 首个插件网络能力前 | not-started | Security review owner 待分配 | 插件网络能力 |
| 插件包签名、来源与降级攻击模型 | 插件分发实现前 | not-started | Security/release owner 待分配 | 市场、更新和分发 |
| `MIGRATIONS.md` | Gate 5 发布准备前 | not-started | Gate 5 implementation owner | Preview 数据升级 |
| `PRIVACY.md` | Gate 5 发布准备前 | not-started | zhangchonghao + Gate 5 implementation owner | Preview 发布 |
| `OBSERVABILITY.md` | Gate 5 发布准备前 | not-started | Gate 5 implementation owner | 诊断和遥测发布 |
| `PLUGIN_DISTRIBUTION.md` | Gate 5 发布准备前 | not-started | Gate 5 implementation owner | 插件市场/分发 |
| `RELEASE_PROCESS.md` | 首个 Preview 前 | not-started | Release owner 待分配 | Preview 发布 |
| `SUPPORT_POLICY.md` | 首个 Preview 前 | not-started | zhangchonghao | 公开平台承诺 |
| `CONTRIBUTING.md` | 开放外部贡献前 | not-started | zhangchonghao | 外部贡献流程 |

## 维护规则

- 新发现的设计前置项必须登记最迟完成 Gate、负责人和阻断对象。
- 进入某个 Gate 前，所有阻断该 Gate 的事项必须达到要求状态，或由维护者通过 ADR 明确延后。
- `accepted` 只说明设计允许实施；只有可执行验证完成后才改为 `implemented`。
- 不得用“负责人待分配”跨过 Gate；开始相应工作前必须落实到具体人员。
- 完成或延后事项时同步更新本表、ROADMAP 和对应文档，避免三者漂移。
