# 开放事项与 Gate 阻断关系

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-27

本文件是尚未完成的设计、决策和治理交付物的统一登记。它不代替对应文档；各 Gate 开始前必须检查本表，不能只依赖全文搜索。

“设计状态”使用 `draft`、`proposed`、`accepted`、`implemented`、`deprecated` 或 `superseded`；尚未创建的交付物使用 `—`，不能提前宣称为 draft。“执行进度”使用 `not-started`、`researching`、`validation-pending`、`in-progress`、`verified`、`completed` 或 `deferred`。设计获批不等于工作完成，执行完成也不能倒推设计已批准。

Gate 1 已于 2026-08-27 完成技术评审并关闭，责任分配和证据见 [Gate 1 关闭评审](reviews/GATE1-CLOSURE.md)。Accountable/Implementation owner、Engineering baseline verification owner、Contract Gateway verification owner 与 Security review owner 均为 `zhangchonghao`。Codex 可以执行、分析和辅助评审，但不是长期责任主体。

| 决策或交付物 | 最迟完成时间 | 设计状态 | 执行进度 | Accountable owner | Verification owner | 阻断事项 |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline 0.1 最终评审与首个提交 | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed；baseline `3a5ad77` |
| `PRODUCT.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| `ROADMAP.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| `ARCHITECTURE.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| `PLATFORM_CAPABILITIES.md` | Gate 1 前 | accepted | completed | zhangchonghao | zhangchonghao | completed |
| ADR-0009 工程技术栈 | 正式工程骨架前 | implemented | completed | zhangchonghao | zhangchonghao | 精确版本、正式 workspace、三平台 CI、基础 Electron E2E 和对应平台原生目录产物 build/smoke 已在提交 `70ce029` 验证；公开发布与真实桌面体验不由 Gate 1 推断 |
| ADR-0010 Contract、身份绑定与协议所有权 | Contract Gateway 实现前 | accepted | verified | zhangchonghao | zhangchonghao | Gate 1 Host Renderer 身份绑定、Schema、连接撤销、导航/reload/崩溃 E2E 已在三平台 CI 验证；未来 Plugin UI/Worker 身份仍随 Gate 3 实施 |
| ADR-0011 Capability 多维状态 | Capability Registry 实现前 | accepted | verified | zhangchonghao | zhangchonghao | Launcher Visibility 与 Previous App Focus 已使用独立 ID、五维状态 Contract、Fake Adapter 和降级组合完成本地验证；真实平台 Adapter 证据仍属于 Gate 2 门禁 |
| ADR-0012 副作用结果确定性模型 | Contract Gateway 实现前 | accepted | in-progress | zhangchonghao | zhangchonghao | 600 个 effect/category/outcome/retryability 组合已穷举，Bootstrap/Search/Action/Visibility Gateway 已统一校验；持久幂等键、执行 ID 与独立状态查询随首个持久写契约完成 |
| `ERROR_MODEL.md` | Contract Gateway 实现前 | accepted | in-progress | zhangchonghao | zhangchonghao | 只读与当前 Host 写方法的错误信封、取消、超时、输出 Schema、unknown/query-status-first 已验证；通用持久写恢复仍待对应纵向切片 |
| `ENGINEERING_BASELINE.md` 三平台工程验证基线 | 正式工程骨架前 | implemented | completed | zhangchonghao | zhangchonghao | 正式 workspace、Ubuntu 原生 Wayland smoke、默认拒绝网络、三平台 CI、基础 Electron E2E 及对应平台目录产物 build/smoke 已通过；真实设备、签名、安装和交互式平台能力仍按后续 Gate 验证 |
| 可丢弃工具链验证原型流程 | 工程基线接受前 | accepted | completed | zhangchonghao | zhangchonghao | Ubuntu Wayland、构建和目录产物证据已记录；正式应用验证仍独立进行 |
| `threat-model/GATE1_HOST_GATEWAY.md` | Contract Gateway 实现前 | accepted | verified | zhangchonghao | zhangchonghao | 负向测试、无原型 JSON 重建/危险键拒绝、脱敏、安全回退、4096 次连接压力和 Renderer 有界恢复已通过，并取得三平台 CI/E2E 证据 |
| 架构边界自动检查规则 | Gate 1 退出前 | accepted | verified | zhangchonghao | zhangchonghao | dependency-cruiser 已执行包方向、环和 Electron 导入规则 |
| ADR-0013 Host Search 有界事件流 | Gate 2 实现前 | accepted | verified | zhangchonghao | zhangchonghao | 本地事件流、ack、背压、跨连接拒绝、reload/撤销清理已验证；三平台证据仍属于 Gate 2 退出门禁 |
| `specs/HOST_VERTICAL_SLICE.md` | Gate 2 实现前 | accepted | validation-pending | zhangchonghao | zhangchonghao | 本地 Host Slice、单实例桌面入口召回、Renderer 崩溃有界安全恢复、独立 Electron Launcher Adapter、组合框/live region/alert、forced-colors、200% 缩放、Ubuntu/Electron 召回 p95，以及 GNOME 50.1 隔离 Shell/Wayland 的协议、服务生命周期和 Shell 重启链路已验证；真实窗口恢复仍需正常 GNOME 会话证据。原生全局快捷键不在当前切片，Windows/macOS、正常 GNOME 用户会话、多显示器和人工辅助技术复查仍阻断完整 Gate 2 |
| `audits/LEGACY_BEHAVIOR.md` | Gate 2 实现前 | accepted | completed | zhangchonghao | zhangchonghao | 首个 Host Slice 行为审计完成；插件深入审计延后 Gate 3，数据迁移样本延后 Gate 5 |
| `threat-model/GATE2_HOST_SEARCH.md` | Gate 2 实现前 | accepted | validation-pending | zhangchonghao | zhangchonghao | 本地威胁控制、组合框语义和 Ubuntu/Electron 召回性能已验证；真实平台 Adapter、辅助技术和完整平台证据待完成 |
| ADR-0014 GNOME Shell 扩展组件协议与认证 | 首个 GNOME Shell 扩展实现前 | accepted | validation-pending | zhangchonghao | zhangchonghao | 最小恢复方法、窗口销毁/工作区变化清理、受限 Host 重启接管、重放/速率/epoch 边界、固定 D-Bus 接口和 Main Transport 已实现；GNOME 50.1 隔离 headless Shell/Wayland 已稳定验证加载、撤销、轮换和 Shell PID 重启后的旧 client 撤销，候选清理有状态机测试；真实焦点恢复及当前用户正常桌面的安装/启用、Shell restart、工作区、多显示器与辅助技术证据仍待完成 |
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
- 进入某个 Gate 前，所有阻断该 Gate 的事项必须达到要求状态，或由有权决定的一方通过 ADR 明确延后；延后若影响产品范围、公开支持、费用、外部服务、权限或不可逆操作，必须由维护者决定。
- `accepted` 只说明设计允许实施；只有可执行验证完成后才改为 `implemented`。
- 不得用 `unassigned` 跨过对应 Gate；开始相应工作前必须落实到具体人员。
- 完成或延后事项时同步更新本表、ROADMAP 和对应文档，避免三者漂移。
