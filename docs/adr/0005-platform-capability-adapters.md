# ADR-0005：用 Capability 与 Adapter 隔离平台差异

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: before Gate 2 platform Adapter implementation
- Supersedes: none
- Superseded by: none
- Related: [PLATFORM_CAPABILITIES](../PLATFORM_CAPABILITIES.md), [PLATFORM_SUPPORT](../PLATFORM_SUPPORT.md)

## 背景

Windows、macOS 和 GNOME Wayland 对全局快捷键、窗口焦点、屏幕捕获、输入自动化和文件选择具有不同安全模型。若业务层直接判断平台并调用系统 API，产品语义、权限和降级会散落且难以测试。

## 决策驱动因素

- 三个平台共享稳定产品语义。
- 对不可用、需授权和需扩展做显式表达。
- 遵守 Wayland、Portal 和操作系统授权边界。
- 平台实现可以被 Fake 和契约测试替换。

## 考虑的方案

### 方案 A：业务层使用平台条件分支

局部开发快速，但差异扩散、测试组合爆炸，插件也会依赖平台细节。

### 方案 B：Capability Registry + 平台 Adapter

业务层使用产品语义契约，Adapter 报告状态并映射具体平台 API。

### 方案 C：只提供三个平台最小公约数

接口最统一，但会牺牲用户期待的丰富平台能力。

## 决策

选择方案 B。

所有平台功能以 Capability 定义稳定语义、状态、授权、错误、取消和资源生命周期。Windows、macOS 和 GNOME Wayland Adapter 独立实现；业务层不得散布 `process.platform`。Capability 状态与调用者 Permission 不得互相冒充；更细的状态分解由 ADR-0011 决定。

允许安全、明确的受控降级，不要求三个平台伪装拥有完全相同的底层能力。

## 后果

### 正面

- 平台差异集中且可发现。
- 插件 API 不泄漏 Win32、AppKit、D-Bus 或 GNOME 私有概念。
- 拒绝、依赖缺失和系统授权可以统一测试。

### 代价与风险

- Capability 设计必须以产品语义为中心，过宽会变成平台 API 转发层，过窄会产生大量碎片接口。
- 需要真实平台测试，Mock 不能证明桌面集成可用。

## 安全、隐私与权限影响

能力可用性与插件 Permission 分离。Adapter 不得在系统授权失败后选择绕过路径，也不能向插件暴露无关系统指纹。

## 平台影响

Ubuntu 首阶段基线是 26.04 GNOME Wayland，Portal 与 D-Bus 是基础集成路径；根据 ADR-0007，标准接口无法安全提供的高价值能力可以由用户可选、职责最小的官方 GNOME Shell 扩展补充。

## 迁移与回滚

当前无 vNext 实现迁移。错误 Capability 抽象通过新 ADR 和契约版本调整，不允许业务模块私自旁路。

## 验证方式

- 三个平台 Adapter 运行共享契约测试。
- lint 禁止业务模块读取平台标识。
- 真实平台 E2E 验证成功、拒绝、取消、缺失依赖与清理路径。

## 实施记录

尚未实施。
