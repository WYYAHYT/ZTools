# 首个宿主纵向切片验收规格

- Status: accepted
- Progress: validation-pending
- Required before: Gate 2 implementation
- Product owner: zhangchonghao
- Verification owner: zhangchonghao

本文件是 Gate 2 的正式验收规格载体，依据 [旧项目只读行为审计](../audits/LEGACY_BEHAVIOR.md) 的 LB-01、LB-02、LB-04、LB-05、LB-07、LB-08、LB-09 编写。它规定第一个“不含第三方插件”的宿主搜索切片。产品决定和接受记录见 [Gate 2 入口评审](../reviews/GATE2-ENTRY.md)。

## 首个切片范围

包含：可信 Host UI、宿主内存中的固定命令、可取消本地搜索会话、结构化增量结果、一个宿主动作、主窗口显示/隐藏状态和焦点恢复状态。

不包含：第三方插件、SQLite、市场、网络 Provider、剪贴板/文件粘贴、窗口匹配、旧插件兼容、账号、持久化历史、原生全局快捷键和真实应用启动。平台召回先通过 Fake Capability 与 Adapter 契约验证；真实快捷键/焦点能力另设平台集成项。

## 用户旅程优先级

| 优先级 | 开始状态 | 用户动作 | 可观察结束状态 | 允许降级 |
| --- | --- | --- | --- | --- |
| P0 | Host 运行且窗口隐藏 | 召回窗口 | 窗口显示、搜索输入聚焦、显示能力状态 | 焦点恢复受限不能阻塞搜索，显示受限原因 |
| P0 | 搜索页 | 输入文本 | 旧会话取消；新会话产生稳定首批和增量结果 | 单个 Provider 失败只影响该来源 |
| P0 | 有结果 | Arrow/Enter 或点击 | 选择可见；动作返回成功或稳定失败 | 不可用时保留搜索页并显示恢复建议 |
| P0 | 查询/输入上下文/空状态 | 连续按 Esc | 依次清查询、清输入上下文、隐藏窗口 | 隐藏失败必须显示，不假装成功 |
| P1 | 搜索进行中 | 快速新查询或隐藏 | 旧结果不能覆盖新查询；资源可验证释放 | 迟到结果丢弃并只做脱敏诊断 |

## 功能验收

进入完整 Gate 2 前按以下场景形成自动测试和平台证据：

- 主窗口首次召回、重复召回、隐藏和先前应用已退出。
- 空查询、快速连续查询、查询取消和窗口隐藏时的未完成请求。
- 首批结果、迟到结果、重复结果、来源失败和稳定排序。
- 动作成功、拒绝、取消、超时、结果未知和恢复方式。
- 离线、网络不可用、平台 Adapter 不支持或暂不可用。
- 多显示器、缩放、键盘导航、屏幕阅读器和高对比度。

### 契约与边界

| 契约 | 调用者 | 输入 | 输出/事件 | 权限与资源 |
| --- | --- | --- | --- | --- |
| `host.search.session.start` v1 | `host-renderer` | `sessionId`、查询、deadline | `started`、零个或多个 `resultBatch`、最终状态 | 每窗口一个活动会话；新会话取消旧会话 |
| `host.search.session.cancel` v1 | `host-renderer` | 自己的 `sessionId` | `cancelled` 或幂等已结束 | 只能取消同连接拥有的会话 |
| `host.action.execute` v1 | `host-renderer` | 已展示结果的 `actionId` 与参数 | `committed`、`not-started`、`not-committed` 或 `unknown` | 首切片只执行宿主内存动作，不接受命令字符串 |
| `host.window.visibility.set` v1 | Host Renderer/Main | `show`/`hide` 与原因 | visibility/focus 状态 | Renderer 不直接操作 Electron Window |

所有输入输出必须有运行时 Schema、连接身份、deadline、取消、稳定错误码和审计字段。未知方法、字段、session 所有者和 actionId 默认拒绝。Search Application 不依赖 Vue、Electron、Node 或具体 Provider。

### 搜索结果身份、去重与稳定排序

- `resultId` 由 Provider namespace + Provider 内稳定 ID 组成；不得由数组索引、标题或图标路径充当身份。
- `dedupeKey` 由 Search Domain 根据结果语义生成；首切片固定命令使用规范化 command ID。相同 key 只保留优先级最高的候选，其余记录计数但不记录正文。
- 所有文本在进入匹配前执行 Unicode NFC、大小写折叠和首尾空白清理；查询最大 256 Unicode code points，结果标题最大 256、说明最大 512。
- 排序形成全序：匹配等级（exact > prefix > token-prefix > substring > subsequence）→ Provider priority → 规范化标题 → resultId。首切片不使用历史频率，避免未设计的数据持久化影响确定性。
- 增量批次只能插入或更新稳定 `resultId`；同一 revision 的同 ID 重复事件幂等。较低 revision、旧 session 和 completed 后事件丢弃。
- UI 选择绑定 `resultId`，批次合并后尽量保持当前选择；结果消失时选择下一个可见结果，不能把同一数组位置的其他动作误当成原选择。

### Launcher Visibility / Previous App Focus Capability 语义

Launcher Visibility 和 Previous App Focus 是两个独立 Capability，分别使用 `host.launcher-visibility` 与 `host.previous-app-focus` 标识，并各自提供 ADR-0011 的多维状态。动作可以组合调用两者，但不得把状态合并成一个快照：

| 轴 | 首切片 Fake/Adapter 语义 |
| --- | --- |
| implementation | 当前 Adapter 是否实现 show/hide 或 previous-focus 产品语义 |
| dependency | 所需 Portal、Shell 扩展或系统服务状态；不需要时为 `not-required` |
| systemAuthorization | 系统授权未确定、允许、拒绝或限制；不能由 Host Permission 覆盖 |
| health | 当前会话 ready/degraded/unavailable，可独立变化 |
| permission | Host Renderer 为 `not-applicable`；未来插件不能继承 Host 权限 |

显示/隐藏和恢复焦点是两个独立结果。窗口已隐藏但焦点恢复受限时，动作 `effectOutcome` 仍是 `committed`，输出分别携带 `visibilityCapability` 与 `focusCapability`，UI 另显示 `focusResult=restricted/unavailable`；不得用可用的显示能力掩盖不可用的焦点能力，也不得为了焦点失败自动再次隐藏或显示窗口。

### 测试矩阵

| 层级 | 必测场景 |
| --- | --- |
| Domain | Unicode 正规化、匹配等级、全序、去重、revision、选择保持 |
| Application | 新查询取消旧查询、Provider 并发、单来源失败、deadline、隐藏取消、迟到丢弃 |
| Contract | Caller Role、Schema、版本、session owner、action token、sequence、ack、超限 |
| Stream | 4 批背压、断线、无 ack、重复/倒序事件、1,000 次替换后资源归零 |
| Capability | ADR-0011 状态组合、show/hide、焦点成功/受限/失败、运行期撤销 |
| Host UI | 空查询、快速输入、键盘循环、选择保持、Esc 分步、错误文案、ARIA live |
| Electron E2E | reload/hide/render gone 清理与有界本地恢复、Bridge 白名单、无 Node/Electron、CSP/导航阻断 |
| 平台 | 三平台召回、快捷键冲突、焦点结果、多显示器/缩放和明确降级 |

## 性能与资源目标

先记录测量环境、数据规模和基线，再由维护者接受具体目标：

- 召回到可交互的时间分布。
- 输入到本地首批结果的时间分布。
- 新查询发出后旧查询停止产生可见结果的时限。
- 空闲/搜索时 CPU、内存和消息数量。
- 单个慢 Provider 对主线程和其他结果的影响。

目标必须使用分位数和测量方法，不能只写平均值或“快速”。建议在三个目标平台各运行 30 次召回和 100 次查询，固定 200/2,000 条宿主命令数据集，记录 p50/p95/p99、取消到无旧结果时间、CPU、RSS、消息数和未释放会话。

本切片采用以下工程体验目标：在固定数据规模和测量方法下，本地搜索首批结果 p95 ≤ 100ms，窗口召回到可交互 p95 ≤ 300ms。它们不是对所有未来 Provider 或平台集成的公开性能承诺；真实测量不达标时必须先分析原因并优化，不能通过隐藏测试放宽目标。接受记录见 [Gate 2 入口评审](../reviews/GATE2-ENTRY.md)。

## 本地化与数据预期

首切片只提供简体中文 UI，未翻译诊断回退为稳定英文 key；不保存用户查询、结果 payload 或使用历史；内存命令随进程退出丢弃。该语言范围和数据留存由维护者在 [Gate 2 入口评审](../reviews/GATE2-ENTRY.md) 中接受。

## 平台证据

| 平台 | 自动证据 | 真实会话证据 | 允许降级 |
| --- | --- | --- | --- |
| Ubuntu GNOME Wayland | Contract/Application/Fake Adapter、Electron E2E | 召回、焦点、Portal | 能力缺失显示 unavailable，不绕过授权 |
| Windows x64 | 三平台 CI、Electron E2E、Fake Adapter | 快捷键、焦点、多显示器 | 快捷键冲突返回 conflict，搜索仍可使用 |
| macOS arm64 | 三平台 CI、Electron E2E、Fake Adapter | app hide/activate、权限、焦点 | 恢复受限时保留搜索，不强行激活其他应用 |

Gate 1 Ubuntu smoke 不能代替 Gate 2 平台证据；Windows/macOS 结果仍是阻断项。

## 当前实现证据

已完成并在 Ubuntu 开发环境验证的范围：

- Search Domain 的 Unicode NFC/大小写折叠、匹配等级、稳定全序、去重和 `resultId` 选择保持。
- Search Application 的固定内存 Provider、查询替换取消、Provider 独立失败、迟到结果丢弃、连接取消和资源清理。
- Host Contract/Gateway 的运行时 Schema、连接/session 所有权、单调 sequence、事件时间戳、64 KiB 事件上限、50 条批次上限、4 批未确认窗口、ack、跨连接拒绝和随机 action token；Electron 原生窗口隐藏事件按当时的可信连接撤销 Search Gateway，Renderer 在已提交隐藏、新查询与卸载时释放 Search Handle。
- Host UI 的简体中文搜索、无持久化查询/结果/历史、稳定结果选择、键盘上下移动、Enter 动作和分步 Esc。
- Launcher Visibility 与 Previous App Focus 两个 Capability 各自的 implementation、dependency、systemAuthorization、health、permission 五维快照、Fake Adapter 组合、独立 Electron Launcher Adapter 和命名 Visibility Contract；当前 Adapter 明确报告活动窗口显示 `ready`、窗口缺失 `health=unavailable`、焦点恢复 `unsupported/unavailable`，空查询 Esc 通过正式 Contract 隐藏窗口。
- Electron E2E 的 Bridge 白名单、Renderer Node 隔离、搜索结果替换、24 次 reload、连接撤销、Renderer 崩溃后的有界安全恢复、弹窗/导航拒绝、隐藏动作，以及 combobox/listbox/option、活动选项和选择状态语义；搜索反馈使用独立 atomic live region，错误使用 assertive alert，空状态不进入 listbox。forced-colors 自动化验证系统高亮选中态和可见焦点边界，200% Electron 缩放验证无横向溢出且搜索输入继续可操作。无查询/结果载荷的 Main 诊断验证隐藏后活动 session、ack buffer 与 capacity waiter 均归零；崩溃前存在未确认批次时，`render-process-gone` 先清理旧连接全部资源，再只加载打包内固定 Host 文档并建立新 epoch。每个窗口最多自动恢复两次，两次均验证 Host 就绪、搜索输入聚焦和命名 Bridge 可用；第三次崩溃不进入无限重载，以明确错误状态退出。
- 桌面入口重复启动使用 Electron 单实例所有权：第二进程不读取或记录启动参数、正常退出并通知首实例；首实例经 Launcher Capability 恢复最小化状态、显示并聚焦唯一 Host 窗口。真实双进程 Electron E2E 验证窗口隐藏后第二次启动只召回一个窗口且搜索输入可聚焦。该证据不是原生全局快捷键实现。
- 固定 2,000 条内存命令数据集、100 次查询的本地首批 p95 测量，1,000 次 session 替换资源压力测试，以及当前 Ubuntu/Electron 会话中 30 次隐藏后召回到下一渲染帧且搜索框可聚焦的 p95 ≤ 300ms 测量。
- GNOME 50.1 隔离原生 Shell/Mutter/Wayland 链路的扩展加载、固定 D-Bus 方法、Main Transport、重放拒绝、disable/reenable，以及不同 PID 的 Shell 进程重启；跨重启持续存活的旧 Host client 检测 extension epoch 变化后自我撤销。真实窗口焦点恢复曾取得成功样本，但因 headless compositor 无法稳定控制前台归属，不计入稳定门禁，仍需正常 GNOME 会话证据。

这些证据只代表当前 Ubuntu 开发环境、隔离 GNOME 会话和平台无关核心；自动可访问性语义、forced-colors 与缩放证据不替代 GNOME Orca、Windows Narrator、macOS VoiceOver 和真实系统高对比度的人工体验复查。它们也不替代 Windows/macOS 真实会话、三平台 CI、当前用户正常 GNOME 桌面的 Shell restart/多显示器/工作区证据，不关闭 Gate 1 或 Gate 2。

## 退出条件

- 本文已转为 `accepted`，并在 `docs/reviews/` 留评审记录。
- 旧行为审计完成首切片用户行为、失败案例和放弃项。
- Search Session、Action、Launcher Visibility/Previous App Focus 契约所有权、Schema、权限、取消、超时、错误和审计语义明确。
- P0 旅程通过 Fake Adapter 与对应平台证据；旧结果不覆盖新查询，隐藏和取消不泄漏资源。
- 可访问性、性能测量方法、目标值和降级文案有复查证据。

## 接受范围与剩余门禁

产品范围、语言、数据留存和候选性能目标已由 [Gate 2 入口评审](../reviews/GATE2-ENTRY.md) 接受，因此允许实现和验证本切片。`accepted` 不表示所有退出条件已经完成；当前 Host UI 语义与 Ubuntu/Electron 召回基线已有自动化证据，Windows/macOS、完整 GNOME 平台集成、人工辅助技术复查和 Gate 转换仍需单独完成。
