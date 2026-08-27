# ADR-0013：Host 搜索使用连接绑定的有界事件流

- Status: accepted
- Proposed: 2026-08-26
- Accepted: 2026-08-26
- Decider: development agent under delegated technical authority
- Approval record: [Gate 2 technical design review](../reviews/GATE2-TECHNICAL-DESIGN.md)
- Verification owner: zhangchonghao
- Review by: before Gate 2 Host Search implementation
- Supersedes: none
- Superseded by: none
- Related: [HOST_VERTICAL_SLICE](../specs/HOST_VERTICAL_SLICE.md), [ADR-0004](0004-typed-rpc-contracts.md), [ADR-0010](0010-contract-schema-identity-ownership.md), [ERROR_MODEL](../ERROR_MODEL.md)

## 背景

Gate 2 要求查询会话产生首批和后续增量结果，同时支持新查询取消旧查询、窗口隐藏取消、Provider 独立失败、迟到结果丢弃和资源上限。Gate 1 Gateway 当前是单次 request/response；直接扩展为长时间等待的单响应会推迟首批结果，直接使用任意 Electron IPC 事件又会绕过已接受的身份、Schema、取消和审计规则。

## 决策驱动因素

- 首批结果可以先于慢 Provider 返回。
- 事件归属绑定 trusted connection 和 session，载荷不能伪造所有者。
- 明确背压、顺序、重放、取消、断线和缓冲上限。
- Host Renderer 不获得通用订阅或裸 IPC 能力。
- Search Application 不依赖 Electron 或传输实现。
- 三平台 Electron E2E 可以稳定同步和验证资源清理。

## 考虑的方案

### 方案 A：单个 RPC 等待全部 Provider 后返回

实现最简单，复用 Gate 1 request/response，但无法提供真实增量结果；慢 Provider 会延迟首批结果，也不利于单来源失败隔离。

### 方案 B：轮询 `search.session.read`

保持请求/响应模型，Renderer 定期读取下一批。实现容易限流，但会引入轮询延迟和空请求，隐藏窗口或 Renderer 阻塞时仍可能积压服务端结果。

### 方案 C：连接绑定的有界 MessagePort/事件流

`session.start` 成功后返回逻辑 `streamId`，Gateway 在只读、连接绑定的端口上发送版本化事件。事件带单调 `sequence`；每个 stream 有固定缓冲和未确认窗口；Renderer 通过命名 Bridge 取消或确认批次。连接结束自动取消并释放端口。

## 提议决定

选择方案 C，但只作为 Host Search 专用流，不创建通用事件总线。

- Bridge 暴露 `startSearch(query, callbacks)` 返回只含 `cancel()` 的逻辑句柄；不暴露 `MessagePort`、channel 名或通用 `subscribe`。
- Main 根据发送方 `webContents` 建立 trusted connection；`connectionId`、Caller Role 和 stream 所有者不来自 payload。
- `host.search.session.start` 是 request/response 建立操作，成功值包含不透明 `sessionId`、`streamId` 和协议版本。
- 流事件只有 `started`、`resultBatch`、`providerFailed`、`completed`、`cancelled`、`failed`；每种都有严格 Schema。
- 每个事件含 `sessionId`、从 1 开始单调递增的 `sequence` 和 `emittedAtUnixMs`；Renderer 忽略非当前 session、重复或倒序事件。
- 每连接最多 1 个活动搜索 session；新 session 原子取消旧 session。每批最多 50 个结果，单事件不超过 64 KiB，最多 4 个未确认批次；达到上限时暂停 Provider 消费，不丢弃已确认顺序。
- Renderer 每处理一个批次通过专用 `ackSearchBatch(sessionId, sequence)` 确认。未知、跳跃或跨连接确认默认拒绝。
- Renderer 取消、窗口隐藏、导航、连接撤销、deadline 或 Host 退出都会关闭流、向 Search Application 传播取消并清理缓冲。
- 无法中断的 Provider 迟到结果在 Application session generation 检查处丢弃，不进入流，也不记录查询/结果正文。
- 流只承载结构化搜索候选，不承载可执行代码、HTML、回调、Electron 对象、文件正文或平台句柄。

## 后果

### 正面

- 首批和后续结果具备明确顺序、所有权、取消和背压语义。
- 慢 Provider 不阻塞快 Provider，Renderer 卡顿也不会导致无限缓冲。
- 连接生命周期与 Gate 1 的撤销模型一致。

### 代价与风险

- Gateway 需要新增 stream registry、ack 窗口和端口清理测试。
- MessagePort 在三个 Electron 目标平台上的断线和 reload 行为必须 E2E 验证。
- 事件流状态比轮询复杂，必须避免“通用总线”扩张。

## 安全与隐私

- Host 搜索查询和结果正文默认不记录。
- 流身份完全来自连接上下文，payload 中的角色、connectionId 或 streamId 不能改变所有权。
- Provider ID 和失败原因只暴露 Host UI 所需的稳定最小字段。
- 超限、未知 ack、重复 sequence 和关闭后事件属于协议错误，可撤销 stream；不能扩大为任意方法调用。

## 验证方式

- 状态机单元测试覆盖 start、首批、ack、背压、完成、取消、deadline、Provider 失败和断线。
- Contract 测试覆盖未知事件、跨连接 ack、倒序/重复 sequence、超大批次和关闭后发送。
- 资源压力测试覆盖至少 1,000 次 session 替换和 Renderer 不 ack 的缓冲上限。
- Electron E2E 覆盖快速连续查询、reload、hide 和 Renderer 终止后无残留 stream。
- dependency-cruiser 阻断 Search Domain/Application 导入 Electron、Vue 和传输模块。

## 当前状态

本 ADR 已在既定产品边界内按委托技术权限接受。Host Search stream 已完成本地实现与自动化验证：除连接撤销、reload 和 Renderer 卸载外，Electron 原生窗口 `hide` 事件会按事件发生时的可信连接撤销 Search Gateway；Renderer 在已提交隐藏后释放本地 Search Handle；独立 Renderer 崩溃 E2E 先保持一个未确认批次，再验证 `render-process-gone` 后连接清理和活动 session、未确认批次与容量等待者均归零。Windows/macOS 和完整真实桌面平台证据仍未完成，因此本 ADR 继续保持 `accepted`，Gate 2 也不据此标记完成。
