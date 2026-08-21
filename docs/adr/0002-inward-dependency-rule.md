# ADR-0002：领域核心保持技术无关

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: Gate 1 exit
- Supersedes: none
- Superseded by: none
- Related: [PRINCIPLES](../PRINCIPLES.md), [ARCHITECTURE](../ARCHITECTURE.md)

## 背景

跨平台桌面项目容易把 Electron、UI、数据库和 `process.platform` 条件分支扩散到业务逻辑，最终任何平台或安全变化都会穿透整个系统。vNext 需要稳定的产品语义和可替换的外层实现。

## 决策驱动因素

- 领域规则可以快速、确定地测试。
- 平台与基础设施实现可独立替换。
- 防止 Electron 成为无法替换的“全局框架”。
- 让自动化工具能够识别非法依赖。

## 考虑的方案

### 方案 A：按功能自由使用 Electron 与平台 API

起步直接，但依赖会快速扩散，平台差异和 I/O 难以测试。

### 方案 B：分层并执行向内依赖规则

领域核心与应用服务只依赖稳定领域类型和 Ports；Electron、Vue、数据库及平台 API 位于 Adapter/Delivery 外层。

### 方案 C：只用编码约定，不设置结构边界

文件组织简单，但规则无法可靠执行，长期会退化为方案 A。

## 决策

选择方案 B。

Domain Core 不依赖 I/O 和技术框架；Application Services 只通过 Ports 使用外部能力；Contracts 定义边界数据；Adapters 与 Delivery 负责具体技术。依赖方向由包结构、lint、类型和 CI 执行。

## 后果

### 正面

- 核心规则可在无 Electron、无桌面会话环境下测试。
- Windows、macOS 与 GNOME Wayland Adapter 可以独立演进。
- 存储或 UI 选择不会成为领域模型的一部分。

### 代价与风险

- 需要设计 Ports 和边界映射，简单用例代码量可能增加。
- 若抽象早于真实用例，可能产生无价值接口；因此只随纵向切片建立端口。

## 安全、隐私与权限影响

外部不可信数据在边界转换，不直接进入领域对象；权限决策集中于应用服务和策略，而非散布在 UI 或平台代码。

## 平台影响

平台差异留在 Adapter。业务层禁止读取 `process.platform` 或桌面环境变量来决定行为。

## 迁移与回滚

当前无实现迁移。若边界不适用，应通过新 ADR 调整，而不是在模块内部增加旁路。

## 验证方式

- 禁止 Domain/Application 导入 Electron、Vue、数据库驱动和平台实现。
- 使用依赖图检测环和逆向依赖。
- Domain 单元测试无需启动 Electron。

## 实施记录

尚未实施。
