# ADR-0003：新插件使用默认安全运行时

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: before Gate 3 implementation
- Supersedes: none
- Superseded by: none
- Related: [SECURITY](../SECURITY.md), [PLUGIN_MODEL](../PLUGIN_MODEL.md)

## 背景

效率工具插件需要搜索、UI、后台任务和系统能力，但插件代码可能错误、被供应链污染或具有恶意行为。允许插件直接访问 Node.js、Electron、preload 或通用 IPC，会使权限声明失去意义，并把宿主和用户数据暴露给所有插件。

## 决策驱动因素

- 第三方插件默认不可信。
- 插件能力丰富但必须可授权、审计和撤销。
- 插件崩溃和资源滥用不能拖垮宿主。
- Secure Runtime 的安全边界不受旧插件兼容影响。

## 考虑的方案

### 方案 A：信任插件并提供 Node/Electron

开发自由度最高，但无法建立有效的最小权限和隔离。

### 方案 B：沙箱 UI、隔离 Worker、受控 Bridge

UI 与 Worker 分离，只能通过宿主建立身份的类型化 API 使用能力。

### 方案 C：所有插件只允许声明式扩展

安全面最小，但不足以支持目标中的丰富交互与后台工作流。

## 决策

选择方案 B。

新插件默认在 Secure Runtime 中运行：Plugin UI 开启 `contextIsolation`、`sandbox`、`webSecurity`，不能使用自定义 Electron preload；Plugin Worker 由宿主管理并受资源配额限制。两者不能访问 Node.js、Electron、裸 IPC 或宿主私有对象。

搜索、设置、市场、账号和权限中心是可信 Host UI，不使用“特权插件”模式。

## 后果

### 正面

- 权限模型有可执行的隔离基础。
- UI 关闭不必终止合法后台任务，Worker 故障也不直接污染 UI。
- 可以为插件调用建立统一审计、超时和配额。

### 代价与风险

- 插件 API 必须覆盖真实需求，不能依赖 Node 生态作为逃生口。
- Worker 隔离技术和配额需要原型验证。
- 部分旧插件无法直接运行。

## 安全、隐私与权限影响

这是插件信任边界的基础决策。任何关闭上述浏览器安全选项或暴露通用 Node/Electron 能力的变化属于 Level 3。

## 平台影响

Secure Runtime 契约跨平台一致；具体 Capability 由平台 Adapter 实现或明确降级。

## 迁移与回滚

当前无新插件需要迁移。旧插件策略由 ADR-0006 决定。不能通过回退 Secure Runtime 安全配置解决兼容问题。

## 验证方式

- 恶意插件夹具尝试访问 Node、Electron、裸 IPC、其他插件数据和未声明 API时必须失败。
- 测试 UI/Worker 独立终止、超时、配额和撤销清理。
- CI 检查 Electron WebPreferences 的安全不变量。

## 实施记录

尚未实施。
