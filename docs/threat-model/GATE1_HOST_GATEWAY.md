# Gate 1 Host Renderer 与 Contract Gateway 威胁模型切片

- Status: accepted
- Progress: verified
- Required before: Contract Gateway implementation
- Accountable owner: zhangchonghao
- Security review owner: zhangchonghao
- Verification owner: zhangchonghao
- Last updated: 2026-08-27
- Accepted: 2026-08-26
- Decider: development agent under delegated technical authority
- Approval record: [Baseline 0.1 delegated authority](../reviews/BASELINE-0.1.md)

本切片只覆盖 Gate 1 的可信 Host Renderer、最小 Bridge、Electron Main 中的 Contract Gateway，以及它们与 Application Service 之间的边界。Gate 1 不运行第三方插件；Plugin UI、Plugin Worker、插件安装身份和插件权限令牌留到 Gate 3 威胁模型扩展。

本文件已达到 `accepted`，Gate 1 范围的最小 Contract Gateway 已实现并通过负向测试、安全配置、架构边界、三平台 Playwright Electron E2E 和 Ubuntu 原生 Wayland smoke。Gateway 已覆盖旧 epoch、非法请求版本/ID、tombstone 生命周期、速率/并发边界、连接资源压力和输出 Schema 错误；有界 IPC 编码会将 JSON 重建为无原型对象，拒绝 `__proto__`/`constructor`/`prototype` 并执行深度、数组和字符串上限；诊断字段脱敏、危险键丢弃及安全配置回退也有自动测试。Gate 1 范围已在提交 `70ce029` 的三平台 CI 中验证，因此 Progress 为 `verified`；未来插件身份和平台真实交互不属于本切片。

## 范围与受保护资产

范围内组件：

- Electron Main 中的窗口注册、Composition Root 与 Contract Gateway。
- 可信 Host Renderer 及其最小 Bridge。
- Renderer 与 Main 之间的受信传输适配。
- Contract Schema validator、错误信封、deadline、取消与关联 ID。
- Gateway 到 Application Service 的显式映射。

重点资产：

- Host Renderer 的 Caller Role 与窗口/`webContents` 身份绑定。
- Contract 方法白名单、Schema、权限前置条件和协议版本。
- 请求与响应的完整性、关联关系和生命周期。
- Host UI 可见数据、诊断日志和错误细节。
- 有副作用调用的幂等状态与结果确定性。

## 攻击者与故障假设

- 外部内容或未来 XSS 缺陷可能在 Host Renderer 上下文执行脚本。
- Renderer 可以发送任意字节、伪造载荷字段、超大消息、乱序请求和重复请求。
- 旧 Renderer、导航前页面、已销毁窗口或重载前 Bridge 可能尝试继续使用旧通道。
- 消息可能延迟、重复、丢失；Renderer 或 Main 可能在调用期间崩溃、退出或断开。
- Schema 库、反序列化、错误格式化和日志路径可能被恶意输入触发资源消耗或信息泄漏。
- Gate 1 不假设恶意第三方插件身份；相关威胁不能因此从 Gate 3 的模型中删除。

## 信任边界与身份建立

```text
Host Renderer JavaScript
        │ untrusted message payload
        ▼
Minimal Bridge / transport
        │ transport identity, not payload identity
        ▼
Electron Main Contract Gateway
        │ ConnectionContext + strict Schema + method policy
        ▼
Application Service mapping
```

- Caller Role、窗口身份和连接 ID 由 Electron Main 根据宿主创建的窗口注册记录建立。
- 消息中的 Caller Role、`webContentsId`、窗口 ID 或权限字段不能覆盖连接上下文。
- 每次导航、reload、Renderer 替换、窗口销毁或通道断开都终止旧 `ConnectionContext`，取消活动请求并拒绝迟到消息。
- `webContents` 数字 ID 不能单独作为永久凭据；必须结合宿主管理的实例记录与生命周期。
- Gate 1 不把 Host Renderer 视为与 Main 同等信任；Host Renderer 被污染时仍只能使用其白名单接口和角色范围。

## 威胁与控制

| ID | 威胁 | 必需控制 | 接受前证据 |
| --- | --- | --- | --- |
| G1-01 | 载荷伪造 Caller Role、窗口或连接身份 | 身份仅来自 Main 建立的 `ConnectionContext`；忽略或拒绝自报身份 | 伪造字段负向契约测试通过 |
| G1-02 | 导航、reload、崩溃恢复或销毁后的旧连接重放 | 连接 epoch/实例绑定；生命周期事件撤销上下文与活动请求；崩溃后只在固定预算内加载打包内 Host 文档 | Gateway 旧 epoch 负向测试和三平台 Electron 导航/reload/崩溃恢复 E2E 通过 |
| G1-03 | 未知方法或不允许的 Host 角色调用 | 方法白名单、角色矩阵、未知调用默认拒绝 | 未知方法负向测试通过；Gate 1 只注册 host-renderer |
| G1-04 | Schema 绕过、未知字段、原型污染 | schema-first 严格验证；拒绝未知字段；安全对象映射；不信任原型链 | 未知字段、自报身份、三种危险键、嵌套污染、无原型重建和安全回退测试通过 |
| G1-05 | 超大消息、深递归、超长数组或恶意格式导致 DoS | 传输前大小上限、Schema 长度/深度上限、validator 预算、速率与并发限制 | 有界 IPC 字符串、超大消息、非法编码、速率/并发上限和 4096 次连接压力测试通过；常规门禁在三平台 CI 通过 |
| G1-06 | 请求 ID 碰撞、响应串线或迟到响应污染新请求 | Gateway 生成/验证关联 ID；连接作用域；完成后 tombstone/忽略迟到响应 | 活动重复与完成后 tombstone 测试通过 |
| G1-07 | deadline、取消或断线导致资源泄漏 | 单调预算、取消传播、所有者清理、断线终止、迟到结果丢弃 | deadline、连接撤销与清理测试通过 |
| G1-08 | 超时/崩溃后重复副作用 | 方法 effect 声明、幂等键、结果查询、正交 `effectOutcome` 字段 | 三个纸面例证、600 组合穷举和当前 Host 写方法 Gateway 校验已通过；持久幂等键/执行 ID/独立状态查询随首个持久写契约完成 |
| G1-09 | Host UI 被外部内容或 XSS 污染后越权 | 严格 CSP、禁止远程脚本、导航默认拒绝、Bridge 最小方法集、无 Node/Electron | CSP/WebPreferences、命名 Bridge、导航/弹窗三平台 E2E 与 Wayland smoke 通过 |
| G1-10 | 错误、Schema 诊断或日志泄露敏感载荷 | 稳定错误信封、字段级脱敏、载荷默认不记录、内部堆栈不跨边界 | 错误载荷不泄漏和 safe diagnostics 自动测试通过；常规门禁在三平台 CI 通过 |
| G1-11 | Gateway 绕过 Application Service 直接修改状态 | 显式 Delivery mapping；禁止数据库/Adapter 私有导入；包边界检查 | dependency-cruiser 与 Bootstrap Application 映射通过 |
| G1-12 | 协议版本混淆或降级 | 连接握手固定协议版本；方法版本白名单；不兼容默认拒绝 | 版本矩阵和降级负向测试 |

## Gate 1 方法与角色矩阵

Gate 1 正式产品 Gateway 只开放一个只读方法，不为未来插件、设置或平台能力预建通用入口：

| 方法 | 版本 | 允许 Caller Role | effect | 输入 | 输出语义 | deadline | 审计 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `host.bootstrap.get` | `1` | `host-renderer` | `read-only` | 严格空对象 | 应用版本、协议版本和可安全公开的宿主就绪状态 | 2 秒 | 只记录方法、结果类别、耗时和 correlation ID，不记录响应载荷 |

- 未登记的方法、版本和 Caller Role 一律在分派前拒绝。
- Gate 1 不登记 `plugin-ui`、`plugin-worker` 或 `platform-helper` 连接，也不创建这些角色的占位权限。
- Bridge 暴露命名方法 `getBootstrap()`，不得向 Renderer 暴露通用 `invoke(method, payload)`。
- Application 映射只调用公开的 Bootstrap 查询用例；Gateway 和 Delivery 不直接读取数据库、平台 Adapter 私有实现或可变全局状态。
- 测试可以在 Gateway 包内直接构造方法描述夹具来验证有副作用结果组合，但测试方法不得进入产品注册表或 Renderer Bridge。

## 连接生命周期

每个 Host 窗口实例遵循以下状态，不以可复用的 `webContents.id` 单独作为身份：

```text
unregistered
    │ Main 创建受信窗口并登记实例 epoch
    ▼
registered
    │ preload 建立一次性 MessagePort，Main 核对发送方和 epoch
    ▼
active ── navigation/reload/render-process-gone/window-destroyed/port-close ──► revoking
    │                                                                        │
    │ 正常请求                                                               │ 取消活动请求
    └────────────────────────────────────────────────────────────────────────┤ 拒绝新消息
                                                                             │ 清理 tombstone
                                                                             ▼
                                                                          revoked
```

- `ConnectionContext` 由 Main 创建并冻结，包含随机 connection ID、窗口实例 epoch、`host-renderer` 角色、协商协议版本和根取消信号。
- preload 只转交结构化消息；载荷中的角色、窗口 ID、connection ID 或权限字段不能建立或改变身份。
- 任何主框架导航、reload、Renderer 崩溃、窗口销毁或通道关闭都同步进入 `revoking`；先拒绝新请求，再取消活动请求并释放监听器。
- 同一窗口重载后创建新 epoch 和新连接；旧请求 ID、响应和取消消息不能在新连接中命中。
- Renderer 崩溃后必须先完成旧连接撤销，再只加载打包内固定 Host 文档；每窗口最多自动恢复两次。恢复加载失败或预算耗尽时销毁窗口并以错误状态退出，不加载远程回退页，也不无限重试。
- 已完成或撤销的请求 ID 在该连接清理窗口内保留 tombstone；重复消息返回协议错误，迟到响应只计入脱敏诊断后丢弃。

## 消息和资源限制清单

以下值是 Gate 1 的初始安全上限，不是公开插件协议承诺。实现原型可以降低上限；提高上限必须附资源测量和负向测试证据。

| 项目 | Gate 1 上限/规则 | 验证方式 |
| --- | --- | --- |
| 单条传输消息 | UTF-8 等效大小不超过 64 KiB，在完整 Schema 校验前执行有界大小检查 | 边界值、超 1 字节和压缩/异常对象夹具 |
| 对象嵌套深度 | 最多 8 层 | 深度 8/9 夹具，validator 不递归失控 |
| 单字符串 | 最多 8 KiB；方法名最多 128 字节；请求 ID 固定格式且最多 64 字节 | 长度边界与无效 Unicode/格式测试 |
| 单数组 | 最多 100 项；Gate 1 Bootstrap 输入不允许数组 | 长度 100/101 测试 |
| 未知对象字段 | 一律拒绝 | 每个 Contract 自动生成额外字段负向测试 |
| 单连接活动请求 | 最多 16 个 | 第 17 个在分派前返回稳定资源限制错误 |
| 单连接等待队列 | 不排队；达到并发上限即拒绝 | 慢请求并发测试 |
| 方法 deadline | `host.bootstrap.get` 为 2 秒；调用者可请求更短预算，不能延长 | 1 秒、2 秒和超长 deadline 测试 |
| 错误 `details` | 序列化后最多 4 KiB，仅允许方法 Schema 声明字段 | 超限截断不得发生，整个不合法结果转内部协议错误 |
| 单个日志字段 | 最多 1 KiB；消息载荷和响应载荷默认不记录 | 敏感标记与超长字段脱敏测试 |
| 连接级调用速率 | 每 10 秒最多 100 次，突发最多 20 次；超限不进入应用层 | 可控时钟速率测试 |
| 取消与断线清理 | 1 秒内完成 Gateway 自有监听器、计时器和请求登记清理；不可中断下游的迟到结果继续隔离丢弃 | 假时钟和残留资源断言 |
| 请求 tombstone | 连接存活期内最多保留 256 项或 60 秒，取先到者；连接撤销时整体清除 | 重复、迟到和上限淘汰测试 |

大小检查必须针对实际传输编码或有明确更严格的保守估算，不能先对任意深对象执行无界 `JSON.stringify`。Schema validator 只使用预编译、无网络访问、无用户提供正则的格式规则。

## 副作用结果纸面例证

以下例证固定 Gateway 结果信封语义，不表示这些功能已进入 Gate 1 产品方法表。

### 只读：`host.bootstrap.get`

- `effect` 为 `read-only`，所有成功和错误结果的 `effectOutcome` 都必须是 `not-applicable`。
- Renderer 在 deadline 前未收到结果时，`category` 为 `deadline-exceeded`、`effectOutcome` 为 `not-applicable`；可按读取退避策略重试。
- 若 Schema、角色或协议不合法，请求在分派前以 `protocol` 或 `rejected` 返回，仍使用 `not-applicable`。

### 幂等写：候选 `settings.value.set`

- 幂等键由 Host UI 为一次用户意图生成，作用域为设置主体、设置键和目标值；commit point 是设置事务提交。
- 分派前权限/Schema 拒绝返回 `not-started`；事务明确回滚返回 `not-committed`；提交成功返回 `committed`。
- 提交后响应丢失返回 `deadline-exceeded` 或 `unavailable` + `unknown` + `query-status-first`；调用方先读取当前值，必要时携带同一幂等键重放。
- 相同幂等键与不同目标值组合必须返回 `conflict`，不能覆盖首次意图。

### 非幂等写：候选 `action.execution.start`

- `effect` 为 `non-idempotent-write`，commit point 由具体动作契约定义；执行 ID 在开始副作用前持久登记。
- 分派前拒绝返回 `not-started`；动作确认尚未越过 commit point 时返回 `not-committed`；已确认执行返回 `committed`。
- 进程崩溃、平台 API 超时或断线且无法确认结果时返回 `unknown` + `query-status-first`，绝不自动重新执行。
- 状态查询使用执行 ID；若底层能力无法查询最终状态，UI 必须诚实展示结果未知和人工确认建议。

Gateway 必须穷举验证方法 `effect`、结果 `category`、`effectOutcome` 和 `retryability`。任何矛盾组合（例如只读方法返回 `committed`、写成功返回 `unknown`、未知结果标记可直接退避重试）都转为内部协议错误，不发送给调用方。

## 与 ADR-0012 的关系

G1-08 不能仅靠 `category` 判断副作用是否发生。已接受的 ADR-0012 要求 `effectOutcome` 作为正交字段；Gateway 必须验证方法 `effect`、结果确定性和 `retryability` 的合法组合，并阻止未知结果下的非幂等自动重试。

## Gate 1 接受条件

- ADR-0010、ERROR_MODEL 和 ADR-0012 已接受。
- Host Renderer → Bridge → Gateway → Application 的数据流和身份来源已评审。
- G1-01 至 G1-12 每项都有至少一项预防控制和一项测试/检查设计。
- 方法/角色矩阵、消息上限表、生命周期状态表和三个副作用结果例证完成。
- 未解决的高影响威胁已阻断相关实现，而不是只记录为未来待办。
- 获得委托的技术决策者/安全评审负责人明确把本文件转为 `accepted`。

## 实施验证条件

- 负向 Contract 测试、导航/旧连接测试、超限输入测试和取消竞态测试通过。
- CSP、WebPreferences、Bridge 白名单和包依赖违规能被自动检查阻断。
- 日志与错误脱敏测试通过，不保存测试载荷中的敏感标记。
- 完成后只把本切片的 Progress 更新为 `verified`；长期总威胁模型仍按后续 Gate 演进。
