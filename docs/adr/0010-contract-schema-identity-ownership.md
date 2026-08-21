# ADR-0010：Contract Schema、连接身份与协议所有权

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: independent Agent review incorporated; zhangchonghao
- Verification owner: Gate 1 implementation owner
- Review by: before Gate 1 Contract Gateway implementation
- Supersedes: none
- Superseded by: none
- Related: [ARCHITECTURE](../ARCHITECTURE.md), [SECURITY](../SECURITY.md), [ERROR_MODEL](../ERROR_MODEL.md), [ADR-0004](0004-typed-rpc-contracts.md)

## 背景

ADR-0004 接受类型化 RPC，但没有确定运行时 Schema 的唯一来源、静态类型派生方式、调用者身份如何绑定连接，以及 Application Port、模块公开接口和 RPC DTO 分别由谁拥有。若直接开始工程，容易形成万能 `contracts` 包、类型与验证漂移，或信任插件消息中的自报身份。

## 决策驱动因素

- 不可信消息必须运行时验证，静态类型不能作为安全边界。
- Schema 与 TypeScript 类型应来自一个权威来源。
- 插件和 Renderer 不能伪造 Caller Role、插件 ID 或权限上下文。
- 功能 Contract 由边界所有者维护，不形成全局依赖中心。
- 协议可生成测试、文档和兼容性检查，并保留未来跨语言实现可能。
- 错误、取消、截止时间、幂等和未知副作用结果具有统一语义。

## 考虑的方案

### 方案 A：JSON Schema 兼容的 schema-first 定义，静态类型从 Schema 派生

候选实现为 TypeBox 风格的类型构造器配合 Ajv 风格的独立验证器。Schema 是运行时权威，TypeScript 类型由 Schema 派生；边界 DTO 映射为应用命令和领域值。

优点是格式标准化、可生成工具、可严格验证且利于未来跨语言；缺点是需要管理 validator 编译、格式扩展和 Schema 版本兼容。

### 方案 B：TypeScript 类型优先，再生成或手写运行时 Schema

开发直观，但生成工具限制和手写漂移会使安全边界不可靠。

### 方案 C：Zod/Valibot 类运行时对象作为权威

开发体验好、类型推导直接，但跨语言和标准 Schema 输出能力依具体库与版本而异；复杂转换容易把验证与业务映射混在一起。

### 方案 D：IDL/代码生成（例如 Protobuf）

版本和跨语言能力强，但对 Electron/插件 JSON 消息、动态贡献声明和前端工具链较重；仍需额外表达权限与调用身份元数据。

## 决策

选择方案 A，并遵循以下协议模型：

### Schema 权威

- 边界 Schema 是运行时和静态类型的单一权威；禁止先写独立 TypeScript DTO 再手工复制 Schema。
- 具体库和版本在实现前通过小型原型确认，目标语义是 JSON Schema 兼容、严格对象校验和可预编译 validator，不把某个库类型泄漏为公开插件协议。
- 外部对象默认拒绝未知字段；字符串长度、数组上限、数值范围、递归深度和消息大小必须受限。
- 格式校验不能执行网络请求或不受控正则；反序列化结果映射为新对象，不信任原型链。

### 身份来源与连接绑定

- Electron Main/受信 Gateway 在创建连接时建立不可变 `ConnectionContext`，包含连接 ID、Caller Role、宿主/插件身份、协议版本和生命周期信号。
- Host Renderer 身份来自宿主创建并核验的 `webContents`/窗口注册记录。
- Plugin UI 身份来自宿主为已验证插件创建的专属 Renderer 注册记录。
- Plugin Worker/Helper 身份来自宿主生成的进程实例记录和一次性握手材料，握手完成后绑定到底层通道。
- 消息载荷中的 Caller Role、插件 ID、权限或用户 ID 仅可作为业务字段，不能覆盖 `ConnectionContext`。
- 导航、Renderer 替换、Worker 重启、插件禁用和通道断开必须终止旧上下文并撤销活动请求。

### 所有权与映射

- Application Port 由消费外部能力的应用模块拥有，Adapter 只实现它。
- Public Module Contract 由提供事实或用例的模块拥有。
- RPC/Plugin Contract 由暴露端点的 Delivery 边界拥有，并显式映射到应用输入输出。
- Contract Kernel 只拥有协议版本、请求 ID、deadline、取消、流控制和统一错误信封；功能 DTO 不进入 Kernel。
- 模块内接口不会因为 RPC DTO 存在而改用序列化形态。

### 调用处理顺序

1. 从受信通道取得 `ConnectionContext`。
2. 检查协议版本、消息大小和方法是否存在。
3. 验证该 Caller Role 是否允许调用方法。
4. 严格验证输入 Schema。
5. 查询当前插件状态、Capability 与 Permission。
6. 建立 deadline、取消信号、关联 ID 和必要幂等上下文。
7. 映射并调用 Application Service。
8. 把结果或错误映射为边界 Schema，脱敏审计后返回。

任一步骤失败均不得分派到业务实现。

## 后果

### 正面

- 静态类型与运行时安全来自同一 Schema。
- 身份不依赖不可信载荷。
- Contract 所有权可阻止万能共享包和内部模型泄漏。
- Gateway 规则可自动生成负向测试。

### 代价与风险

- 需要原型验证 Schema 工具的 Electron 打包、性能和错误输出。
- 显式 DTO 映射增加代码，但保护领域模型与兼容边界。
- 流式协议和大对象 Handle 仍需后续专门 Contract。

## 安全、隐私与权限影响

这是调用身份与输入验证的核心安全决策。Gateway 日志只记录必要元数据；载荷默认不入日志。连接令牌和握手材料不得进入 Renderer 可持久化存储或错误报告。

## 平台影响

协议语义跨平台一致。Platform Helper 的底层启动与认证方式可以不同，但都必须建立同等可信的 `ConnectionContext`，不得因为是本机通信就省略身份验证。

## 迁移与回滚

当前无 vNext 协议。若候选 Schema 工具原型失败，可替换库而不改变 schema-first、连接绑定和所有权原则；若需要改变这些原则，应新建 ADR。

## 验证方式

- 静态类型与 Schema 一致性编译测试。
- 未知字段、超限输入、恶意原型、未知方法和错误角色的负向测试。
- 伪造插件 ID/Caller Role、旧连接重放和导航后旧通道调用必须失败。
- Contract Kernel 依赖规则与包图测试。
- 取消、deadline、幂等和未知结果按 `ERROR_MODEL.md` 执行契约测试。

## 实施记录

决策已接受，尚未实施。
