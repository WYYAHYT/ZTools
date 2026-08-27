# 错误、取消与副作用结果模型

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

本文件定义 Gate 1 Contract Gateway 和应用用例共享的错误、取消和副作用结果语义。具体错误码目录可以随纵向切片补充，但不得改变本文已接受的类别和安全边界。

## 目标

- 调用方能区分业务拒绝、系统不可用、取消、超时和协议错误。
- 边界错误稳定、可序列化且不泄漏内部堆栈或敏感数据。
- 超时或断线不会被错误解释为“操作肯定没有发生”。
- 应用代码使用明确结果；异常主要表示编程错误或无法在当前层恢复的不变量破坏。

## 结果类别

| 类别 | 语义 | 默认重试 |
| --- | --- | --- |
| `success` | 操作完成并返回经过验证的结果 | 不需要 |
| `rejected` | 输入、状态、权限或策略明确拒绝，操作未开始 | 只有前置条件变化后 |
| `cancelled` | 调用者或用户取消；是否产生副作用由操作契约明确 | 不自动 |
| `deadline-exceeded` | 截止时间前未得到确定结果 | 只读可按策略重试；写操作先恢复状态 |
| `unavailable` | 依赖、Adapter、Worker 或会话当前不可用 | 仅幂等操作退避重试 |
| `conflict` | 版本、状态或并发前置条件不匹配 | 读取新状态后 |
| `internal` | 宿主内部失败，已隐藏敏感细节 | 默认不自动 |
| `protocol` | 方法、版本、Schema 或调用角色无效 | 不重试；可能终止连接 |

## 稳定错误信封

跨隔离域错误至少包含：

- `code`：命名空间化稳定代码，例如 `permission.denied`。
- `category`：上表类别。
- `messageKey`：供 Host UI 本地化的稳定键；不把开发者异常直接展示给用户。
- `retryability`：`never`、`after-user-action`、`after-state-change`、`safe-with-backoff` 或 `query-status-first`。
- `correlationId`：连接日志与诊断，不包含主体机密。
- `details`：方法专用、Schema 验证且不敏感的结构化信息；默认省略。

内部 cause、堆栈、路径、SQL、系统令牌和插件载荷不跨边界。插件只能看到为其角色声明的错误子集。

## 取消与 deadline

- `deadline` 是绝对截止时刻或可安全换算的剩余预算，逐层传递时只能缩短，不能延长。
- `cancelled` 是正常控制流，不记录为未处理异常。
- 收到取消后停止尚未开始的工作，并向下游传播；无法中断的系统调用必须忽略其迟到结果并继续完成资源清理。
- 取消确认只证明宿主停止等待，不自动证明有副作用操作未发生。
- 资源所有者负责在成功、失败、取消、断线和进程退出路径释放 Handle、订阅、Portal 会话与临时文件。

## 副作用、幂等与未知结果

每个方法必须声明 `effect`：

- `read-only`：无持久副作用，可在策略允许时重试。
- `idempotent-write`：相同幂等键重复调用产生同一逻辑结果。
- `non-idempotent-write`：不能安全自动重试，必须提供恢复或状态查询方式。

有副作用的方法还必须声明：

- 幂等键的生成者、作用域、有效期和持久化边界。
- 操作在何时视为 committed。
- 超时、断线或进程崩溃后如何查询最终状态。
- 重复请求返回原结果、冲突还是拒绝。

如果调用方无法确定写操作是否提交，结果必须将 `effectOutcome` 表达为 `unknown`，并将 `retryability` 设为 `query-status-first`；禁止把它映射为普通失败后直接重试。`category` 继续表达调用为什么没有得到正常结果，不能代替副作用确定性。

根据已接受的 [ADR-0012](adr/0012-effect-outcome-certainty.md)，副作用确定性是与 `category` 正交的 `effectOutcome` 字段。所有有副作用的方法必须声明 `effect`、commit point、结果查询或恢复方式、幂等键语义和合法的 `category`/`effectOutcome`/`retryability` 组合。正式 Contract 不得继续新增仅靠错误细分码表达副作用确定性的方案。

## 错误所有权

- Domain 拥有业务不变量和稳定领域拒绝原因，不知道 HTTP、IPC、Electron 或平台错误码。
- Application 把 Port/Domain 结果编排为用例级错误与恢复动作。
- Adapter 把操作系统、数据库和外部库错误映射为 Port 定义的错误，不向内泄漏原始类型。
- RPC/Delivery 把应用错误映射为角色可见的边界错误信封和本地化键。
- 原始错误只进入受限、脱敏的内部诊断链。

## 安全与隐私

- 鉴权失败不透露插件、方法或资源是否存在，除非公开契约明确允许。
- Schema 错误对插件返回稳定字段路径和约束类别，不回显完整敏感输入。
- 重复协议攻击、超限消息和身份伪造可以触发连接终止与速率限制。
- 用户取消、权限拒绝和系统授权拒绝不得误报为宿主崩溃。

## 当前实施状态

- TypeScript 结果信封、`effectOutcome` 和 `retryability` 已在 Contract Kernel 表达，600 个可能组合由独立测试矩阵穷举验证。
- Bootstrap、Search、Action 与 Window Visibility Gateway 已统一执行结果组合校验；矛盾组合不能跨边界返回。
- 取消、deadline、连接撤销、reload、窗口隐藏与 Renderer 崩溃的传播和资源清理已有本地自动化证据。
- Host Slice 的窗口显隐和非幂等隐藏动作已覆盖 `committed`、`not-started`、`not-committed`、`unknown + query-status-first` 及 Adapter 输出无效路径。
- 当前尚无需要持久幂等记录、执行 ID 和独立状态查询方法的持久写契约；该范围随首个此类方法实施，不能用当前内存窗口动作替代。
- 稳定错误码和当前中文 `messageKey` 所有权已在各 Contract/Gateway 固定；完整本地化目录随多语言产品范围进入后续 Gate。

## 实施前验证条件

- ADR-0010 与本模型使用一致术语。
- ADR-0012 已接受，并按决定更新本模型与结果信封。
- 至少用一个只读方法、一个幂等写方法和一个结果可能未知的方法完成纸面例证。
- 测试计划覆盖取消竞态、deadline、迟到结果、断线、重复请求和脱敏。
- 通用持久写恢复证据完成后才可把本文状态改为 `implemented`；当前核心结果矩阵与 Host Slice 写方法只构成部分实施证据。
