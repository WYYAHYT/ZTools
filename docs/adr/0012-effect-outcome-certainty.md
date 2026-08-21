# ADR-0012：副作用结果确定性模型

- Status: proposed
- Proposed: 2026-08-21
- Accepted: pending
- Deciders: zhangchonghao
- Approval record: [Further review follow-up](../reviews/BASELINE-0.1.md); pending maintainer decision
- Reviewers: independent Agent review incorporated
- Verification owner: zhangchonghao
- Review by: before Gate 1 Contract Gateway implementation
- Supersedes: none
- Superseded by: none
- Related: [ERROR_MODEL](../ERROR_MODEL.md), [ADR-0010](0010-contract-schema-identity-ownership.md), [Gate 1 threat model](../threat-model/GATE1_HOST_GATEWAY.md)

## 背景

已接受的 `ERROR_MODEL.md` 使用 `category` 表达调用为什么没有得到正常结果，并把无法确定写操作是否提交表达为 `outcome-unknown` 细分码。进一步评审指出，“失败原因”和“副作用是否发生”是两个正交问题。

同一个 `deadline-exceeded`、`cancelled`、`unavailable` 或 `internal` 类别都可能对应未开始、明确未提交、已经提交或结果未知。把 `outcome-unknown` 绑定到某一错误类别或由各 Contract 自行解释，容易导致不安全重试。

## 决策驱动因素

- 调用方可以独立理解失败原因和副作用确定性。
- 超时、断线和崩溃不能被误解为操作未发生。
- 只读、幂等写和非幂等写使用一致的结果信封。
- Gateway 可以统一验证 retryability 与结果确定性的合法组合。
- 插件和 Host UI 不需要猜测特定错误码的副作用语义。

## 考虑的方案

### 方案 A：保留 `outcome-unknown` 错误细分码

改动最小，但未知结果可能由多个 category 触发；调用方需要同时理解每个 code 的隐藏语义，难以统一验证。

### 方案 B：增加正交的 `effectOutcome` 字段

`category` 说明调用结果原因，`effectOutcome` 说明副作用确定性。Gateway 检查两者与方法 `effect` 声明的组合。

优点是语义正交、可统一测试和限制重试；代价是所有结果信封都增加字段，并需要定义合法组合。

### 方案 C：每个有副作用的方法定义自己的确定性字段

局部灵活，但会产生协议碎片，不同 Contract 可能对相同情况使用不同语义。

## 提案

建议选择方案 B。每个结果信封包含：

```text
effectOutcome:
  not-applicable | not-started | committed | not-committed | unknown
```

语义：

- `not-applicable`：方法是 `read-only`，没有持久副作用需要判断。
- `not-started`：请求在有副作用执行开始前终止，例如协议拒绝、权限拒绝或分派前取消。
- `committed`：副作用已确认越过方法定义的 commit point，即使返回路径随后失败。
- `not-committed`：执行可能开始，但已确认没有越过 commit point。
- `unknown`：超时、断线、进程崩溃或外部系统语义使宿主无法确认是否提交。

### 候选组合规则

| 方法 effect | category/result | effectOutcome | retryability |
| --- | --- | --- | --- |
| `read-only` | 任意合法结果 | `not-applicable` | 由 category 决定 |
| 任意写 | `success` | `committed` | `never` |
| 任意写 | `protocol` / 分派前 `rejected` | `not-started` | `never` 或前置条件变化后 |
| 任意写 | `deadline-exceeded` / `unavailable` / `internal` | `unknown` | `query-status-first` |
| 任意写 | 执行中取消且回滚已确认 | `not-committed` | 由幂等契约决定 |
| 幂等写 | 已有相同幂等键且结果已提交 | `committed` | 返回原逻辑结果 |

`cancelled` 不能自动推导 `not-committed`；取消只表示调用方停止等待或宿主请求停止，具体 outcome 由执行状态确认。

### 方法契约要求

每个有副作用的方法必须声明：

- `effect` 类型。
- commit point。
- 哪一层负责确定 `effectOutcome`。
- `unknown` 时的状态查询方法或恢复流程。
- 幂等键的范围、期限和重复调用行为。
- category、effectOutcome 与 retryability 的允许组合。

Gateway 对不合法组合按内部协议错误处理，不把矛盾结果发送给调用方。

## 后果（若接受）

### 正面

- 错误原因和副作用确定性不再混淆。
- 可以统一防止超时、断线和取消后的盲目重试。
- Host UI 和未来插件 API 可以提供一致恢复动作。

### 代价与风险

- 结果信封更复杂，需要所有边界和测试理解新字段。
- Adapter 或外部系统可能无法给出确定结果，必须诚实返回 `unknown`。
- commit point 设计不严谨会制造虚假的 `committed` 或 `not-committed`。

## 安全、隐私与权限影响

- `effectOutcome` 不得包含内部事务、系统路径或敏感业务细节。
- 权限/协议拒绝发生在分派前时应为 `not-started`，防止调用方误以为可能已执行。
- `unknown` 必须阻止自动非幂等重试，减少重复付款、重复写入或重复系统操作风险。

## 平台影响

三个平台共享结果确定性语义。平台 Adapter 负责把系统 API 的实际 commit/unknown 语义映射到 Port 结果，不能为了接口一致伪造确定性。

## 迁移与回滚

当前没有实现。若接受，本 ADR 取代 `ERROR_MODEL.md` 中把 `outcome-unknown` 仅作为细分码的设计，并同步更新 ADR-0010、错误信封和 Contract 测试。若原型证明字段不足，应新建 ADR，不回退到每方法隐式解释。

## 验证方式

- 完成一个只读、一个幂等写和一个非幂等写的纸面例证。
- 穷举方法 effect、category、effectOutcome 与 retryability 的合法/非法组合。
- 测试分派前拒绝、执行中取消、提交后响应丢失、进程崩溃和状态恢复。
- 确认 `unknown` 不触发非幂等自动重试。

## 实施记录

尚未接受，尚未实施。现行规范仍是 `ERROR_MODEL.md` 中的 `outcome-unknown` 细分码。
