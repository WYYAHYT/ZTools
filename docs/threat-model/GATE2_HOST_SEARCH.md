# Gate 2 Host Search 与宿主动作威胁模型切片

- Status: accepted
- Progress: validation-pending
- Required before: Gate 2 Host Search implementation
- Accountable owner: zhangchonghao
- Security review owner: zhangchonghao
- Verification owner: zhangchonghao
- Last updated: 2026-08-26

本威胁模型的产品范围由 [Gate 2 入口评审](../reviews/GATE2-ENTRY.md) 接受；接受本文件允许实现对应的首个 Host Slice，不代表所有列出的真实平台证据已经取得。当前切片明确不覆盖全局快捷键、真实应用启动、文件/剪贴板输入或第三方插件。

本切片覆盖可信 Host Renderer、Search Application、内存 Host Command Provider、宿主动作和 Launcher Visibility/Previous Focus Capability。它不覆盖第三方插件、应用发现、文件/剪贴板输入、网络 Provider、持久化历史或真实应用启动。

## 数据流与资产

```text
Host Renderer
  │ start/cancel/ack/action（不可信载荷）
  ▼
Contract Gateway + connection-bound stream
  │ verified session/action DTO
  ▼
Search / Actions Application
  │ owned Provider + Visibility/Previous Focus Ports
  ▼
In-memory Host Provider + Fake/Platform Adapters
```

重点资产：当前查询 session 所有权、结果顺序与完整性、actionId 不可伪造、窗口/焦点操作权限、查询和结果隐私、Provider/stream 资源、Host UI 响应性。

## 威胁与控制

| ID | 威胁 | 必需控制 | 证据 |
| --- | --- | --- | --- |
| G2-01 | 旧 session 迟到结果覆盖新查询 | connection + generation 绑定；Renderer 只接受当前 session；结束后 tombstone | 快速查询、取消与迟到 Provider 测试 |
| G2-02 | Renderer 不消费导致无限缓冲 | 每批/消息/未确认窗口上限；ack 背压；deadline | 不 ack 压力测试与资源快照 |
| G2-03 | 伪造 session/stream/ack 所有者 | 所有者来自 trusted connection；跨连接默认拒绝 | 跨连接 cancel/ack 负向测试 |
| G2-04 | Provider 返回重复、超大或恶意结果 | Provider DTO Schema、来源配额、稳定去重键、字符串长度和批量上限 | Contract/fuzz/超限测试 |
| G2-05 | 搜索正文或结果泄漏到日志 | 日志只记录 session 元数据、数量、耗时、类别和 correlationId | 敏感 marker 脱敏测试 |
| G2-06 | actionId 被猜测或结果过期后执行 | action capability token 绑定 connection/session/result revision；执行前重新校验 | 未展示、过期、跨 session action 测试 |
| G2-07 | 动作超时后自动重复产生副作用 | 每方法 effect/commit point/effectOutcome；未知结果先查询状态 | ADR-0012 组合和动作恢复测试 |
| G2-08 | Renderer 直接控制 Electron Window/焦点 | 命名 Window Capability Contract；Main 侧身份与状态机 | Bridge 白名单和安全 E2E |
| G2-09 | 可用的窗口显示状态掩盖不可用的焦点恢复，或平台焦点失败导致搜索不可用 | Launcher Visibility 与 Previous App Focus 使用独立 ID 和多维快照；焦点恢复与隐藏提交、搜索可用性解耦 | Fake Adapter 状态组合与 Action Output Schema 测试 |
| G2-10 | 空查询或恶意长查询消耗 CPU | 查询长度/Unicode 正规化预算；空查询走固定命令快照；单连接会话上限 | 长查询、空查询、替换压力测试 |
| G2-11 | 排序不稳定导致选择跳动或错误动作 | 比较键全序；批次合并保持稳定；选择绑定 resultId 非数组索引 | 属性测试与 E2E |
| G2-12 | 隐藏/reload/崩溃后资源残留 | connection owner 清理 Provider、stream、timer、ack 缓冲和 Capability 调用 | 24 次 reload、hide、render-process-gone E2E |

## 动作安全边界

首切片唯一执行型宿主结果为“隐藏 ZTools 并尝试恢复先前应用”。它通过 `host.action.execute` 选择已展示 action，再调用 Launcher Visibility/Previous Focus Application Port。请求不接受 shell 命令、路径、URL、Electron method 或任意参数对象。

- effect：`idempotent-write`。
- 幂等键：由 Host Renderer 为一次用户选择生成，作用域为 connection + actionId，有效期不超过 session 生命周期。
- commit point：Launcher Adapter 已观察到主窗口进入 hidden；焦点恢复结果单独报告，不改变隐藏是否 committed。
- 隐藏前拒绝/能力不可用：`not-started`。
- 明确未隐藏：`not-committed`。
- 已隐藏：`committed`，即使焦点恢复受限。
- 断线/超时且无法读取窗口可见性：`unknown + query-status-first`；不得自动重复。

## Search Session 状态机

```text
created -> starting -> active -> completing -> completed
                    \-> cancelling -> cancelled
                    \-> failed
```

- `created`：Schema 已验证但未进入 Application。
- `starting`：分配 session owner、Provider budget 和 stream；失败必须完整回滚。
- `active`：允许按 sequence 发出有界结果批次；同连接新 session 触发 cancelling。
- `completing`：所有 Provider 终止且缓冲已处理，禁止新结果。
- `completed/cancelled/failed`：终态，释放 Provider、timer、stream、ack 缓冲并保留短期 tombstone。

任何未列出的状态转换都作为内部不变量错误，不能通过类型断言继续运行。

## 接受与实施条件

- ADR-0013、Host Vertical Slice 规格和 Gate 2 入口评审已接受。
- G2-01 至 G2-12 均有自动测试设计，平台相关项有目标证据层。
- action effectOutcome、窗口隐藏和焦点恢复状态彼此独立，不把焦点失败误报为动作未提交。
- 查询/结果正文不进入日志、trace、截图文件名或失败产物。
- 完成真实实现和验证后才把 Progress 标为 `verified`。

## 当前验证证据

已通过本地自动化验证：Contract/Gateway 的未知字段、跨连接 session/action token、ack 背压、连接撤销和资源清理；Search Application 的旧 session 迟到结果丢弃；Launcher Visibility 与 Previous App Focus 的独立 ID、五维快照、Fake Adapter 降级组合、双快照 Action 输出、独立 Electron Launcher Adapter 和命名 Visibility Contract；Electron E2E 的 Bridge、reload、搜索替换、Esc 隐藏、action 隐藏、两项能力的独立展示、组合框关系、独立 atomic live region、assertive alert、forced-colors 和 200% 缩放语义；Electron 原生 `hide` 事件撤销当时可信连接的 Search Gateway，Main 的无载荷 `ztools.search.hidden-cleanup` 诊断验证活动 session、未确认批次和容量等待者均归零；独立 Renderer 崩溃 E2E 在崩溃前保持一个未确认批次，并由 `render-process-gone` 清理连接后验证活动 session、未确认批次和容量等待者均归零；第二个真实 Electron 进程不消费或记录启动参数，取得单实例锁失败后正常退出，并由首实例经 Launcher Capability 召回唯一窗口；固定数据集的搜索性能、1,000 次替换压力，以及当前 Ubuntu/Electron 会话 30 次召回 p95 ≤ 300ms 门禁。GNOME 50.1 隔离原生 Shell/Mutter/Wayland 测试还验证了 Shell PID 重启后服务恢复、extension epoch 变化和旧 Host client 永久撤销。上述证据属于自动化/隔离环境证据，基础用户可见行为另有 Ubuntu GNOME Wayland 手动复测；真实 Windows、macOS 和当前用户正常 GNOME Wayland 会话、人工辅助技术与平台性能证据仍待完成，因此本文件暂不标记为 `verified`。
