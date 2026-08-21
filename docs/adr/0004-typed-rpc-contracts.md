# ADR-0004：隔离边界使用类型化 RPC 契约

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: before Gate 1 Contract Gateway implementation
- Supersedes: none
- Superseded by: none
- Related: [SECURITY](../SECURITY.md), [ARCHITECTURE](../ARCHITECTURE.md)

## 背景

Electron IPC、插件 Bridge、Worker 和 Platform Helper 都跨越隔离边界。仅依赖 TypeScript 类型或任意 channel 字符串，不能验证运行时输入、调用身份、权限和协议兼容性。

## 决策驱动因素

- 默认拒绝未知调用方和未知方法。
- 同时提供编译期体验与运行时验证。
- 统一处理超时、取消、错误和审计。
- 支持协议版本演进和自动生成测试工具。

## 考虑的方案

### 方案 A：直接使用 Electron IPC channel

实现简单，但身份、Schema、权限和错误容易分散或遗漏。

### 方案 B：集中式类型化 Contract Gateway

每个方法声明完整元数据，静态类型由契约派生，运行时统一验证和分派。

### 方案 C：只在边界使用 TypeScript 接口

开发体验较好，但不可信消息在运行时没有保障，也无法安全处理版本差异。

## 决策

选择方案 B。

所有跨进程、跨线程和插件 API 使用版本化 Contract。每个方法必须声明 Caller Role、输入输出 Schema、Permission/Capability、超时、取消、稳定错误和审计策略。默认异步；未知调用者、方法或无效输入默认拒绝。

底层可以使用 Electron IPC、MessagePort 或其他传输，但传输不能成为业务 API，也不能绕过 Gateway。

## 后果

### 正面

- 权限和验证规则可集中审查与测试。
- Host、Plugin UI、Plugin Worker 和 Helper 使用同一契约语言。
- 可以生成客户端绑定、Mock 和兼容性测试。

### 代价与风险

- 契约注册较显式，需要避免重复手写静态类型和 Schema。
- 流、订阅和大消息需要额外的背压设计。
- 不当的“万能 payload”会破坏该决策，必须通过评审和 lint 防止。

## 安全、隐私与权限影响

调用者身份必须来自宿主建立的连接上下文，不能信任消息中的自报字段。日志与审计只记录必要元数据并脱敏。

## 平台影响

Platform Helper 也遵循同一原则；平台句柄必须映射为受控逻辑 Handle，不通过 RPC 直接暴露。

## 迁移与回滚

当前无 vNext 协议迁移。未来修改公开方法需遵循兼容策略或新 ADR，不能回退到裸 IPC。

## 验证方式

- Contract 注册完整性测试。
- 未知角色、错误 Schema、权限不足、超时和取消测试。
- 静态类型与运行时 Schema 的一致性测试。
- 搜索代码中禁止直接业务使用 Electron `ipcMain`/`ipcRenderer`。

## 实施记录

尚未实施。
