# ADR-0007：GNOME Wayland 完整能力集成策略

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: before first GNOME Shell extension implementation
- Supersedes: none
- Superseded by: none
- Related: [PLATFORM_CAPABILITIES](../PLATFORM_CAPABILITIES.md), [PLATFORM_SUPPORT](../PLATFORM_SUPPORT.md)

## 背景

Ubuntu 26.04 默认 GNOME Wayland 会话限制普通客户端枚举和控制其他应用窗口、强制聚焦以及无授权输入注入。Portal 能安全提供文件选择、屏幕捕获、远程桌面等能力，但不覆盖所有类似 Windows/macOS 的桌面集成语义。

若目标是在 Ubuntu 上提供尽可能丰富的召回、焦点恢复和窗口能力，需要决定是否接受一个由用户显式安装和启用的 GNOME Shell 扩展，并接受 Portal 系统授权弹窗。

## 决策驱动因素

- 尊重 Wayland 与 GNOME 安全模型。
- Ubuntu 体验尽可能接近其他一等平台。
- 安装、升级和故障恢复必须可理解。
- 平台私有能力不能污染跨平台插件 API。

## 考虑的方案

### 方案 A：只使用标准 Portal、D-Bus 与普通客户端 API

系统集成更标准，维护面较小，但全局召回、先前应用焦点、窗口发现等能力可能受限或不可用。

### 方案 B：标准路径 + 可选 GNOME Shell 扩展

核心功能使用 Portal/D-Bus；对于标准接口无法提供且用户价值足够高的能力，使用职责极窄、版本化的可选 Shell 扩展。没有扩展时显式降级。

它能提高 GNOME 能力上限，但增加安装、GNOME 版本兼容、Shell 崩溃隔离、分发与支持成本。

### 方案 C：依赖 X11/XWayland 或非标准绕过方案

可能在部分环境短期工作，但行为脆弱、与目标原生 Wayland 基线冲突，也可能绕过用户授权。

## 决策

选择方案 B，并接受两条不可分割的产品条件：

1. 用户接受敏感操作由 Portal 展示系统授权弹窗，拒绝后产品正常降级。
2. 用户若需要标准 API 无法提供的完整 GNOME 能力，可选择安装并启用官方、开源、职责最小的 GNOME Shell 扩展；基础产品不能强制依赖扩展才能启动。

方案 C 不可接受。GNOME Shell 扩展属于可选组件，不得成为核心搜索、设置或 Secure Runtime 启动的前置条件。

## 后果

### 正面

- 在不欺骗或绕过用户授权的前提下提高 GNOME 功能上限。
- 标准 Portal 路径仍可服务无扩展环境。
- Capability 层可以把扩展存在、缺失和版本不兼容表达为稳定状态。

### 代价与风险

- 需要维护 Electron 应用、Portal/D-Bus Adapter 和 Shell 扩展之间的版本兼容。
- GNOME 升级可能使扩展暂时不可用，必须有发布联测和降级方案。
- 用户安装步骤和系统弹窗会使体验不同于 Windows/macOS。
- 扩展若接口过宽会成为高风险特权代理，必须限制职责。

## 安全、隐私与权限影响

- Portal 授权 UI 不得伪造、自动点击或绕过。
- Shell 扩展只暴露完成已批准 Capability 所需的最小方法和事件。
- 应用与扩展通信必须验证本地主体、版本和消息 Schema，并限制调用频率。
- 扩展不得提供通用 Shell eval、任意窗口操作或任意输入注入接口。
- 活动会话、句柄和订阅在应用退出、插件停止或权限撤销时清理。

## 平台影响

- Ubuntu 26.04 GNOME Wayland：Portal 为基础，扩展提供经批准的增量能力。
- Windows 与 macOS：使用各自原生 Adapter，不暴露 GNOME 概念。
- KDE 与其他桌面：不因本 ADR 获得支持承诺。

## 迁移与回滚

扩展是可选组件。版本不兼容、禁用或卸载时，Capability 必须明确报告外部依赖状态并相应降级；核心搜索和插件运行继续可用。具体状态结构由 ADR-0011 决定。应用升级不能要求通过关闭 GNOME 安全检查维持旧扩展。

## 验证方式

- 在干净 Ubuntu 26.04 GNOME Wayland 中测试无扩展、兼容扩展、旧扩展和禁用扩展。
- 测试 Portal 允许、拒绝、取消、超时和系统服务缺失。
- 对扩展 API 做方法白名单、Schema、身份与速率限制测试。
- GNOME Shell 重启或扩展崩溃时应用必须降级并回收资源。

## 实施记录

决策已接受，尚未实施。
