# Gate 1 Host Renderer 与 Contract Gateway 威胁模型切片

- Status: draft
- Progress: in-progress
- Required before: Contract Gateway implementation
- Accountable owner: zhangchonghao
- Security review owner: zhangchonghao
- Verification owner: zhangchonghao
- Last updated: 2026-08-21

本切片只覆盖 Gate 1 的可信 Host Renderer、最小 Bridge、Electron Main 中的 Contract Gateway，以及它们与 Application Service 之间的边界。Gate 1 不运行第三方插件；Plugin UI、Plugin Worker、插件安装身份和插件权限令牌留到 Gate 3 威胁模型扩展。

本文件达到 `accepted` 前，可以设计 Gateway 契约、测试和边界检查，但不得实现可被 Host Renderer 调用的正式 Contract Gateway。

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
| G1-01 | 载荷伪造 Caller Role、窗口或连接身份 | 身份仅来自 Main 建立的 `ConnectionContext`；忽略或拒绝自报身份 | 伪造字段负向契约测试设计 |
| G1-02 | 导航、reload 或销毁后的旧连接重放 | 连接 epoch/实例绑定；生命周期事件撤销上下文与活动请求 | 导航、reload、销毁状态转换与测试表 |
| G1-03 | 未知方法或不允许的 Host 角色调用 | 方法白名单、角色矩阵、未知调用默认拒绝 | 方法/角色矩阵与负向测试设计 |
| G1-04 | Schema 绕过、未知字段、原型污染 | schema-first 严格验证；拒绝未知字段；安全对象映射；不信任原型链 | 恶意对象和未知字段测试样本 |
| G1-05 | 超大消息、深递归、超长数组或恶意格式导致 DoS | 传输前大小上限、Schema 长度/深度上限、validator 预算、速率与并发限制 | 上限表与资源测试计划 |
| G1-06 | 请求 ID 碰撞、响应串线或迟到响应污染新请求 | Gateway 生成/验证关联 ID；连接作用域；完成后 tombstone/忽略迟到响应 | 并发、重复与迟到响应测试设计 |
| G1-07 | deadline、取消或断线导致资源泄漏 | 单调预算、取消传播、所有者清理、断线终止、迟到结果丢弃 | 取消竞态和资源清理状态表 |
| G1-08 | 超时/崩溃后重复副作用 | 方法 effect 声明、幂等键、结果查询、正交 `effectOutcome` 提案 | ADR-0012 决议与三个纸面例证 |
| G1-09 | Host UI 被外部内容或 XSS 污染后越权 | 严格 CSP、禁止远程脚本、导航默认拒绝、Bridge 最小方法集、无 Node/Electron | CSP/导航/Bridge 配置与回归测试计划 |
| G1-10 | 错误、Schema 诊断或日志泄露敏感载荷 | 稳定错误信封、字段级脱敏、载荷默认不记录、内部堆栈不跨边界 | 错误样本与日志脱敏测试计划 |
| G1-11 | Gateway 绕过 Application Service 直接修改状态 | 显式 Delivery mapping；禁止数据库/Adapter 私有导入；包边界检查 | 依赖规则和故意违规测试设计 |
| G1-12 | 协议版本混淆或降级 | 连接握手固定协议版本；方法版本白名单；不兼容默认拒绝 | 版本矩阵和降级负向测试 |

## 消息和资源限制清单

接受前必须为 Gate 1 的最小方法记录候选值或明确的测量办法：

- 单条消息和单个字段的最大字节数。
- 对象嵌套深度、数组长度、字符串长度和批量结果数量。
- 单连接并发请求数、队列长度和每方法 deadline。
- 错误 details、日志字段和诊断样本的最大大小。
- 取消确认、连接关闭和迟到响应的清理时限。

数值可以在实现原型中测量后调整，但不能留成无限制默认值。

## 与 ADR-0012 的关系

G1-08 不能仅靠 `category` 判断副作用是否发生。ADR-0012 在 Gate 1 Gateway 实现前必须决定 `effectOutcome` 是否作为正交字段。若 ADR-0012 未接受，本切片不能达到 `accepted`。

## Gate 1 接受条件

- ADR-0010 和 ERROR_MODEL 已接受，ADR-0012 已作出决定。
- Host Renderer → Bridge → Gateway → Application 的数据流和身份来源已评审。
- G1-01 至 G1-12 每项都有至少一项预防控制和一项测试/检查设计。
- 方法/角色矩阵、消息上限表、生命周期状态表和三个副作用结果例证完成。
- 未解决的高影响威胁已阻断相关实现，而不是只记录为未来待办。
- 维护者/安全评审负责人明确把本文件转为 `accepted`。

## 实施验证条件

- 负向 Contract 测试、导航/旧连接测试、超限输入测试和取消竞态测试通过。
- CSP、WebPreferences、Bridge 白名单和包依赖违规能被自动检查阻断。
- 日志与错误脱敏测试通过，不保存测试载荷中的敏感标记。
- 完成后只把本切片的 Progress 更新为 `verified`；长期总威胁模型仍按后续 Gate 演进。
