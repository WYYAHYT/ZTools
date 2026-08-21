# 威胁模型

- Status: draft
- Baseline: 0.1
- Last updated: 2026-08-21
- Security review owner: zhangchonghao

本文件把 [SECURITY.md](SECURITY.md) 中的安全目标与不变量扩展为可维护的跨 Gate 威胁模型骨架，不声称已经覆盖尚未设计的插件分发、网络代理和更新协议。Gate 1 的 Host Renderer 与 Contract Gateway 范围由 [专用威胁模型切片](threat-model/GATE1_HOST_GATEWAY.md) 负责；对应功能进入实现前，相关切片必须补齐并接受。

## 范围与假设

保护范围包括宿主、Host UI、Secure Plugin Runtime、插件数据、平台 Adapter/Helper、GNOME Shell 扩展、本地存储、安装包和更新链路。

当前假设：

- 攻击者可以制作恶意插件、Manifest、网页、文件、剪贴板内容、网络响应和 IPC 消息。
- 攻击者可以使插件崩溃、超时、消耗资源，并利用并发、升级和取消竞态。
- 本机其他普通权限进程可能尝试连接 Helper、替换用户可写插件包或读取权限不当的文件。
- 网络攻击者可能控制 DNS、代理、目标服务器或重放下载内容，但不应能突破有效 TLS 与签名信任根。
- 用户可能拒绝、撤销或误解权限，也可能安装本地未签名插件。
- 操作系统、Electron、依赖库和桌面服务可能存在漏洞；项目通过更新、隔离与最小权限降低影响。
- 已完全控制内核、管理员/root、宿主签名密钥或受信安装目录的攻击者不在直接防护承诺内，但应减少其持久化与数据泄漏后果。

## 受保护资产与数据分类

| 分类 | 示例 | 基本控制 |
| --- | --- | --- |
| Secret | 访问令牌、密码、签名/发布密钥、Helper 握手材料 | 系统密钥库或受保护 CI；禁止日志和普通数据库 |
| Sensitive user content | 剪贴板正文、查询正文、文件内容、屏幕流、插件私有数据 | 最小访问、按主体隔离、默认不记录、明确生命周期 |
| Security state | 插件身份、权限决定、完整性哈希、信任来源、系统授权状态 | 完整性、事务、审计、迁移与回滚保护 |
| Personal metadata | 最近动作、文件名、应用使用、账号标识 | 最小收集、保留期限、可删除、导出脱敏 |
| Operational data | 性能指标、错误码、版本、关联 ID | 脱敏、有限保留、不得反推敏感正文 |
| Public data | 插件公开元数据、文档、公开市场目录 | 仍需完整性与来源验证 |

精确的数据所有权、保留与删除规则在 `DATA_OWNERSHIP.md` 和 `PRIVACY.md` 中确定。

## 信任边界与数据流

```text
External package/network/file
             │ untrusted
             ▼
      Installer / Import Boundary ──► verified plugin identity + isolated storage
                                              │
                                              ▼
Plugin UI / Worker ── untrusted messages ──► Contract Gateway ──► Application
       │                                      │ trusted identity       │
       │                                      ▼                        ▼
       └──── no direct access ─────── Permission Policy          Ports/Adapters
                                                                       │
                                   local authenticated channel          ▼
Platform Helper / GNOME Extension ◄──────────────────────────── OS / Portal / Keyring
```

每条实际数据流在实现前必须补充：发起主体、接收主体、资产、Schema、身份来源、权限、加密/完整性、日志、取消、资源所有者和验证测试。

## 威胁登记

| ID | 威胁/攻击路径 | 主要控制 | 当前证据 | 最迟完成 |
| --- | --- | --- | --- | --- |
| TM-01 | 调用方伪造身份、Caller Role 或权限字段 | 连接绑定身份、默认拒绝、ADR-0010 | 已接受设计；Gate 1 Host 身份验证证据待专用切片 | Gate 1 Gateway；插件身份扩展留 Gate 3 |
| TM-02 | 畸形/超大消息、原型污染或 Schema 绕过 | 严格 Schema、大小/深度限制、未知字段拒绝 | ADR-0010 已接受；消息上限与负向验证待 Gate 1 切片 | Gate 1 Gateway |
| TM-03 | Plugin UI 取得 Node/Electron/裸 IPC | sandbox、context isolation、最小 Bridge、恶意夹具 | ADR-0003 | Gate 3 |
| TM-04 | 插件跨命名空间读取数据或密钥 | 身份绑定 Storage Port、系统密钥库、越权测试 | ADR-0008 | Gate 3 |
| TM-05 | 安装包在校验后被替换、降级或回滚 | 原子安装、内容寻址、签名/来源/版本策略 | 未设计 | 分发实现前 |
| TM-06 | 插件升级扩大权限或利用旧 Worker/连接 | 权限重新确认、停流、撤销旧上下文、原子切换 | 部分设计 | Gate 3 |
| TM-07 | 卸载后 Worker、Handle、Portal 会话或数据残留 | 生命周期状态机、所有权、清理测试 | 未设计 | Gate 3/4 |
| TM-08 | Host UI 渲染外部 HTML/脚本导致信任区污染 | 严格 CSP、结构化数据渲染、导航默认拒绝 | SECURITY 不变量 | Gate 2/3 |
| TM-09 | 网络代理造成 SSRF、DNS 重绑定或访问本机服务 | 目标策略、解析后地址检查、重定向复验、私网规则 | 未决 ADR | 首个网络能力前 |
| TM-10 | Helper/Shell 扩展被本地进程冒充或接口过宽 | 本地主体认证、版本握手、Schema、方法白名单、速率限制 | ADR-0007/0010 已接受；具体组件认证尚未设计 | 首个 Helper/扩展前 |
| TM-11 | 权限已撤销但缓存令牌继续工作 | 每次调用状态校验、令牌撤销、订阅终止 | 设计原则 | Gate 3/4 |
| TM-12 | 超时后自动重试导致重复副作用 | 幂等键、状态查询、正交结果确定性 | ERROR_MODEL 已接受；ADR-0012 与实施验证待完成 | Gate 1 Gateway |
| TM-13 | 日志、trace、截图或崩溃转储泄露用户内容 | 默认不记录、脱敏、有限保留、测试检查 | TESTING/SECURITY | 每个 Gate |
| TM-14 | 插件消耗 CPU、内存、消息、磁盘或日志拖垮宿主 | 配额、背压、超时、隔离、有限重启 | 目标设计 | Gate 3 |
| TM-15 | 发布密钥被不可信分支或插件样本读取 | 受保护环境、工作流权限分离、来源限制 | 测试原则 | 发布前 |

## 生命周期攻击面

### 安装

- 校验包结构、Manifest、协议、大小、路径规范化、来源和完整性。
- 解压必须防止目录穿越、符号链接逃逸、压缩炸弹和文件名碰撞。
- 校验与激活之间避免 TOCTOU；安装失败不留下可运行的半成品。

### 升级

- 新版本扩大 Capability 声明时重新获得用户确认。
- 旧 Worker、Renderer、连接、Handle 与任务在切换时撤销。
- 防止版本降级绕过安全修复；失败可回到已验证版本而非任意旧包。

### 运行

- 每次调用验证连接身份、插件状态、Schema、Capability、Permission 和资源范围。
- UI 与 Worker 分离配额和生命周期，不能借另一角色权限升级。
- 外部内容不得直接进入 Host UI 信任上下文。

### 禁用与卸载

- 先阻止新工作，再取消请求、终止执行、撤销会话和释放资源。
- 数据保留、导出或删除遵循用户选择与 `DATA_OWNERSHIP.md`，不由目录删除副作用决定。
- 重装不能自动继承来源或身份不一致插件的旧权限。

## 网络与本地服务

在插件网络能力 ADR 接受前，Secure Runtime 不提供通用网络代理。后续设计至少处理：

- URL 规范化、协议白名单、凭据和重定向。
- DNS 解析后地址策略及每次重定向复验，防止 DNS 重绑定。
- loopback、link-local、私网、云元数据和 Unix socket 等敏感目标。
- Host Header、代理环境变量、证书、响应大小、压缩和超时。
- Cookie、认证头和宿主凭据不跨插件或目标泄漏。

## Helper 与 GNOME Shell 扩展认证

- 通信端点不能只依赖“本机”或可预测 socket/bus 名称建立信任。
- 宿主负责启动或发现经验证版本，执行最小方法白名单和双向版本握手。
- 具体认证材料、文件权限和 D-Bus 策略必须在组件 ADR 中确定。
- 身份失败、版本不兼容或扩展重启时 Capability 降级并撤销旧会话。
- 禁止通用 Shell eval、任意命令执行、任意窗口控制和无范围输入注入接口。

## 验证与接受规则

- 每个威胁必须指向至少一个预防/检测控制和一项自动或人工证据。
- “由沙箱保护”“仅本机通信”或“用户已安装”不能单独作为控制。
- Gate 1 Contract Gateway 实现前接受 [Gate 1 Host Gateway 威胁模型切片](threat-model/GATE1_HOST_GATEWAY.md)，覆盖 Host 身份、Schema、消息限制、错误、取消和进程边界。
- Gate 3 前补齐插件安装、升级、运行、禁用、卸载的具体数据流并完成安全评审。
- 首个网络能力、Helper、市场、自动更新或发布签名实现前，先补齐对应威胁与 ADR。
- 发现未控制的高影响威胁时阻断相关 Gate，不以文档待办替代控制。
