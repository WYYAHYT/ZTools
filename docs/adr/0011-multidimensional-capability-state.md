# ADR-0011：Capability 多维状态模型

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit pending
- Reviewers: independent Agent review incorporated; zhangchonghao
- Verification owner: Gate 1 implementation owner
- Review by: before Gate 1 Capability Contract implementation
- Supersedes: none
- Superseded by: none
- Related: [PLATFORM_CAPABILITIES](../PLATFORM_CAPABILITIES.md), [ADR-0005](0005-platform-capability-adapters.md), [ADR-0007](0007-gnome-wayland-integration.md)

## 背景

早期 Capability 文档用 `available`、`authorization-required`、`extension-required`、`temporarily-unavailable` 和 `unsupported` 组成一个单一状态集合，同时又规定插件 Permission 独立。真实环境中，扩展安装、系统授权、运行健康和插件 Permission 可以同时处于不同状态，单一枚举会丢失原因或产生组合爆炸。

例如：GNOME 扩展已安装但系统授权未确定；平台实现可用但某插件被拒绝；插件曾获持久 Permission 但系统授权后来被撤销；系统服务暂时崩溃但实现仍然受支持。

## 决策驱动因素

- 不把永久不支持、依赖缺失、系统拒绝和瞬时故障折叠在一起。
- Capability 平台状态与主体相关 Permission 保持独立。
- UI 能给出准确原因、恢复动作和状态变化。
- Adapter、权限策略和插件 API 可以分别测试。
- 避免所有组合都成为新的顶层枚举值。

## 考虑的方案

### 方案 A：保留单一互斥状态枚举

接口最简单，但无法无损表达多个条件同时存在，状态优先级会隐藏重要原因。

### 方案 B：多维平台快照 + 独立调用者 Permission

分别表达实现支持、外部依赖、系统授权和运行健康，并针对调用主体单独查询 Permission；可派生调用 readiness，但保留原始原因。

### 方案 C：只返回原因列表

扩展灵活，但缺少稳定结构，调用方容易自行解释优先级并产生不一致。

## 决策

选择方案 B。平台快照至少包含：

| 轴 | 候选状态 |
| --- | --- |
| `implementation` | `supported` / `unsupported` |
| `dependency` | `not-required` / `ready` / `missing` / `disabled` / `incompatible` |
| `systemAuthorization` | `not-required` / `not-determined` / `granted` / `denied` / `restricted` |
| `health` | `ready` / `degraded` / `unavailable` |

针对调用主体单独查询：

| 轴 | 候选状态 |
| --- | --- |
| `permission` | `not-applicable` / `not-requested` / `granted` / `denied` / `revoked` |

每个非正常轴携带稳定原因码、可恢复性、用户动作和状态变化信号。系统可以派生 `readiness` 供 UI 排序或快速判断，但派生结果不能替代完整快照，也不能绕过逐次身份与 Permission 校验。

## 后果

### 正面

- 可以准确表达多条件组合和恢复路径。
- 平台 Adapter 不负责插件 Permission，权限策略也不能伪造平台支持。
- 系统授权撤销、依赖崩溃和插件拒绝可独立测试与通知。

### 代价与风险

- Contract 比单一枚举更大，需要定义一致的派生优先级。
- 某些平台无法无副作用探测系统授权，需要允许 `not-determined`。
- 状态变化事件可能频繁，必须去重、背压并避免泄露无关系统指纹。

## 安全、隐私与权限影响

- Permission 永远按调用主体计算，不缓存为全局 Capability 状态。
- 插件只能看到与其已声明能力相关且经过最小化的状态。
- 系统授权和依赖细节使用稳定原因码，不暴露其他应用、用户或系统敏感配置。
- 即使派生 readiness 为可用，每次调用仍验证连接身份、插件状态、Permission 和输入。

## 平台影响

- GNOME Wayland 可以同时表达 Shell 扩展依赖、Portal 系统授权与 D-Bus/PipeWire 运行健康。
- macOS 可以区分实现支持、Accessibility/Screen Recording 状态和当前服务故障。
- Windows 可以区分实现支持、策略限制、系统服务健康和插件 Permission。

## 迁移与回滚

当前没有实现。若原型证明某一轴需要按 Capability 扩展，可在保持多维与 Permission 分离原则下调整 Schema；改变原则需新 ADR。

## 验证方式

- 用至少三个平台各两个 Capability 建立状态组合表。
- 测试系统授权撤销、依赖安装/禁用、服务崩溃恢复和插件 Permission 撤销。
- 测试派生 readiness 不丢失原始原因且不能绕过调用检查。
- 检查插件只能查询已声明能力的最小状态。

## 实施记录

决策已接受，尚未实施。
