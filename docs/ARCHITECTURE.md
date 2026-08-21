# 总体架构

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

## 架构风格

ZTools vNext 采用模块化单体作为默认部署形态，在安全、故障隔离或平台 API 要求处使用独立 Plugin Worker、Electron Renderer/UtilityProcess 和可选 Platform Helper。

工程技术栈采用 Electron、Vue 3、TypeScript 与 pnpm workspace，不属于 ADR-0001 的“从零模块化单体”决定。其候选比较、平台风险和退出策略记录于已接受的 [ADR-0009](adr/0009-engineering-technology-stack.md)。首次安装依赖或创建工程骨架前仍需接受 [ENGINEERING_BASELINE.md](ENGINEERING_BASELINE.md)，固定精确版本和平台矩阵。

## 逻辑结构

```text
                         ┌──────────── Domain Core
                         │                 ▲
                         │                 │
Host UI / RPC Mapping ───┴────► Application Services + owned Ports
         ▲                                      ▲
         │                                      │ implements
Typed Transport Gateway                 Infrastructure / Platform Adapters
         ▲                                      ▲
         │                                      │
Plugin UI / Worker                    Windows | macOS | GNOME Wayland
```

箭头表示源码依赖。Domain 不依赖 Ports；Application 拥有它所消费的 Ports，并依赖 Domain；Adapter 依赖并实现 Application Port；Delivery/RPC Mapping 依赖公开应用用例和自己的边界 Schema。运行时调用方向可以相反，但不能改变源码依赖方向。

## 层与责任

### Domain Core

- 搜索项、动作、插件身份、能力描述、权限决定等稳定领域概念。
- 不执行 I/O，不引用 Electron、Vue、Node 平台 API、数据库驱动或操作系统类型。
- 规则以纯函数、实体和值对象表达，便于跨环境测试。

### Application Services

- 编排用例、事务、取消、策略和领域对象。
- 只依赖 Ports，不知道具体数据库、Portal 或窗口实现。
- 建立搜索预算、插件调用顺序、权限检查和生命周期状态转换。

### Contracts

以下细粒度所有权模型由已接受的 [ADR-0010](adr/0010-contract-schema-identity-ownership.md) 确定。跨边界数据必须版本化、运行时验证且不得泄漏外层对象。

- Contract 不应成为一个所有模块都依赖的万能共享包，而是边界类别的统称。
- Domain 类型由领域模块拥有；Application Port 由消费该外部能力的应用模块拥有。
- 模块间公开应用接口与事件由提供方模块拥有，只公开稳定语义。
- RPC/插件 Schema 由暴露端点的 Delivery 边界拥有，并显式映射到应用命令、查询与结果；Application 不依赖 RPC Schema。
- 极小的 Contract Kernel 只能包含请求关联、协议版本、分页/流控制和通用错误信封等传输原语，禁止承载功能 DTO、权限策略或领域规则。
- 所有边界数据必须版本化并可运行时验证，不把 Electron 事件、数据库记录或平台句柄直接外泄。

### Adapters / Infrastructure

- 实现存储、系统密钥库、文件、网络和平台 Capability。
- 把平台错误映射为稳定领域错误，并报告能力状态。
- 可以因操作系统不同而替换，但不得改变上层产品语义。

### Delivery

- Electron Main 负责应用生命周期、窗口和隔离域编排。
- Host UI 使用 Vue 构建可信界面，通过受限契约调用应用服务。
- Plugin UI 与 Worker 通过 Secure Runtime 进入 Contract Gateway。

## 运行单元

| 单元 | 责任 | 禁止承担 |
| --- | --- | --- |
| Electron Main | 应用生命周期、窗口、进程、身份和 Adapter 装配 | 领域规则、任意插件代码 |
| Host Renderer | 可信产品 UI | 直接操作数据库和平台私有 API |
| Plugin Renderer | 沙箱插件 UI | Node/Electron、裸 IPC、宿主对象 |
| Plugin Worker | 后台插件任务 | 无限制常驻、派生任意进程、绕过权限 |
| UtilityProcess / Helper | 重计算、故障隔离或窄平台桥接 | 通用业务中心、共享全局状态 |

具体进程数量由测量和安全需求决定，不能把“每个模块一个进程”当作目标。

## 模块所有权

初始模块边界如下，最终包名可在工程骨架 ADR 中细化：

- Search：查询会话、增量结果、排序输入和取消。
- Actions：动作定义、参数和执行结果。
- Plugins：发现、安装、身份、状态与生命周期。
- Capabilities：能力目录、可用性和 Adapter 选择。
- Permissions：授权策略、决定和撤销。
- Contract Gateway：传输适配、调用身份、Schema 验证、超时、取消和审计；不拥有功能 DTO。
- Platform：窗口、快捷键、应用、文件、剪贴板、Portal 等 Adapter。
- Persistence：事务、插件命名空间、附件和密钥引用。
- Diagnostics：结构化错误、健康状态和脱敏日志。

模块不能直接读取其他模块的私有表、内部状态或平台实现，只能通过公开应用接口和事件通信。

## 包级依赖矩阵

ADR-0002 确定“依赖向内”和核心不依赖外层技术；ADR-0010 进一步确定以下包类别、Contract Kernel 与映射所有权：

| 包类别 | 可以依赖 | 禁止依赖 |
| --- | --- | --- |
| Module Domain | 本模块 Domain、极小且无 I/O 的基础值类型 | Application、Ports、RPC Schema、Electron、Vue、Node I/O、数据库、平台实现 |
| Module Application | 本模块 Domain、本模块拥有的 Ports、其他模块的 Public Module Contract | Adapter、Delivery、Electron/Vue、数据库驱动、其他模块私有实现 |
| Public Module Contract | 必要的稳定领域值或专用可序列化类型 | 模块私有实体、Adapter、Delivery、RPC Transport、数据库记录 |
| RPC/Plugin Contract | Contract Kernel、该端点专用的可序列化 Schema | Domain 实体、Application 实现、Electron 对象、平台句柄 |
| Adapter/Infrastructure | 它所实现的 Application Port、必要 Public Contract、外部库 | Delivery UI、其他 Adapter 私有实现、业务编排 |
| Delivery / RPC Mapping | RPC Contract、公开应用用例、UI 框架或传输层 | 数据库驱动、Adapter 私有实现、绕过应用服务的 Domain 修改 |
| Composition Root | 所有待装配模块的公开构造入口 | 业务规则和长期运行的共享可变状态 |

跨模块调用优先使用进程内 Public Module Contract；只有实际跨越进程或隔离域时才映射为 RPC Contract。禁止为了“统一”让所有模块内部调用经过序列化 RPC。

## 契约所有权

- Application Port 由提出需求的应用用例模块拥有，而不是由实现它的 Adapter 拥有。
- Capability 的产品语义由最接近该用户能力的应用模块拥有；Capabilities 模块只拥有状态词汇、注册与策略，不成为所有功能接口的仓库。
- RPC Contract 由暴露端点的边界模块拥有；同一用例可以有 Host UI 与 Plugin API 两套不同 DTO 和权限范围。
- 模块事件由事实来源模块拥有，订阅方不能为方便修改其语义。
- Contract Kernel 的扩展需要 ADR，防止其演变为循环依赖中心。

## 搜索数据流

1. Host UI 创建带取消令牌和截止时间的查询会话。
2. Search 应用服务并发调用宿主 Provider 与已获准的插件 Provider。
3. Provider 增量返回结构化候选，不返回可执行代码或 Host UI 组件。
4. Search 对来源配额、去重和稳定排序进行编排。
5. UI 展示结果；选择动作时重新校验插件状态、调用身份和权限。
6. 新查询、窗口隐藏或会话结束时取消未完成工作并释放订阅。

排序算法和性能预算将在真实纵向切片中确定，不提前写死。

## 状态与事件

- 模块内优先使用显式状态机和事务。
- 跨模块事件表达已经发生的事实，不承担隐式同步 RPC。
- 事件必须有所有者、Schema、版本和幂等语义。
- 不采用全局可变单例作为模块协调方式。
- 插件生命周期、权限请求和 Portal 会话在实现前分别形成状态机文档。

## 错误、超时和取消

- 边界错误使用稳定错误码与安全消息，内部堆栈不发送给插件。
- 所有可能等待 I/O、插件或平台 UI 的调用必须支持超时或取消。
- 取消是正常结果，不应记录为未处理异常。
- 超时不能默认推断操作未发生；有副作用的方法需要幂等键或查询恢复语义。

统一语义在 [ERROR_MODEL.md](ERROR_MODEL.md) 中形成；其被接受前阻断 Contract Gateway 实现。

## Gate 1 最小运行边界

以下进程划分已经接受；具体工具版本与工程创建仍受 `ENGINEERING_BASELINE.md` 阻断：

- Electron Main 只承担 Composition Root、应用生命周期、受信 Contract Gateway、窗口编排和必须位于主进程的平台 Adapter。
- Host Renderer 是独立可信 Renderer，只通过明确 Bridge 使用应用接口，不直接访问数据库或平台私有实现。
- Gate 1 不运行第三方插件，也不预建通用 Plugin Worker 框架；Plugin Renderer 与 Plugin Worker 在 Gate 3 按 Secure Runtime 设计引入。
- UtilityProcess 只在原生依赖、故障隔离或测量证明主进程不适合承担某项工作时引入。Gate 1 不创建无职责的常驻 UtilityProcess。
- Node Worker Thread 只用于同一信任域内经测量的 CPU 工作，不能充当不可信插件沙箱。
- 新增运行单元必须写明身份、所有者、通信契约、崩溃影响和退出清理；“以后可能需要”不是新增进程的理由。

## 自动化边界

工程建立后必须逐步加入：

- 包依赖方向检查。
- 禁止 Domain 导入 Application、Ports、RPC、Electron、Vue、Node I/O、数据库和平台实现。
- 禁止 Application 导入 Adapter、Delivery、Electron、Vue、数据库驱动和平台实现。
- 禁止 RPC/Plugin Contract 导入 Domain 实体、Application 实现、Electron 对象和平台句柄。
- 禁止业务模块直接导入 Electron `ipcMain`、`ipcRenderer`、MessagePort 传输封装或通用 `invoke`。
- 检测包依赖环、跨模块私有导入和万能 Contract Kernel 扩张。
- Contract Schema 与静态类型一致性测试。
- RPC 注册完整性和未知调用默认拒绝测试。
- Platform Adapter 契约套件。
- 插件沙箱配置与权限绕过回归测试。
