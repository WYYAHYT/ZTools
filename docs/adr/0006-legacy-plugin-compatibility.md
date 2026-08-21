# ADR-0006：首阶段旧插件兼容策略

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit pending
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: after first representative Secure Runtime plugins
- Supersedes: none
- Superseded by: none
- Related: [PRODUCT](../PRODUCT.md), [PLUGIN_MODEL](../PLUGIN_MODEL.md)

## 背景

旧 ZTools 插件可能依赖 Node.js、Electron、宽 preload、旧内部 API 或隐式特权。新 Secure Runtime 明确不提供这些能力。首阶段是否承诺兼容旧插件，会显著影响产品范围、插件 API、安全审核和交付节奏。

## 决策驱动因素

- Secure Runtime 的安全边界不能被降低。
- 尽快验证新插件协议和跨平台能力。
- 理解现有用户与插件作者的迁移成本。
- 避免维护两个尚未稳定的运行时。

## 考虑的方案

### 方案 A：首阶段完全不运行旧插件

只开发新 Manifest、API 和 Secure Runtime。后续根据真实需求提供迁移指南、分析工具或独立 Legacy Runtime。

优点是范围和安全模型最清晰，能集中验证新架构。缺点是旧生态不能直接使用，迁移成本会推迟显现。

### 方案 B：首阶段提供受限兼容层

分析旧 API，把可安全映射的子集转换为新 Capability；不支持部分明确报错。

它可帮助简单插件迁移，但兼容语义可能过早塑造新 API，且测试矩阵显著增加。

### 方案 C：提供独立 Legacy Runtime

在独立进程中运行旧插件，明确风险，不允许其进入 Secure Runtime。

它保留最多兼容性，但需要额外沙箱、权限、分发、诊断和生命周期设计；无法自动消除旧插件任意 Node 能力带来的风险。

## 决策

选择方案 A：首阶段完全不运行旧插件。

允许首阶段建设不执行旧代码的迁移辅助，例如清单分析器、API 使用报告、数据导出/导入工具和重写指南。完成 Secure Runtime 与首批真实插件后，再以独立 ADR 评估方案 B 或 C。

首阶段优先建立可信的新生态，并明确接受旧插件不能直接运行。未来若建设兼容层或 Legacy Runtime，必须使用新 ADR，且不得降低 Secure Runtime 的安全边界。

## 后果

### 正面

- 新插件 API 由目标产品语义驱动，不被旧内部实现锁定。
- 首阶段安全审计、平台测试和文档范围可控。
- 不需要为旧运行时放宽 Secure Runtime。

### 代价与风险

- 现有插件作者必须重写或等待迁移工具。
- 用户会感知功能倒退，需要清晰的 vNext 定位与迁移沟通。
- 若过晚研究代表性旧插件，可能遗漏重要用例；应尽早做只读需求分析。

## 安全、隐私与权限影响

方案 A 风险最低。任何未来 Legacy Runtime 必须独立威胁建模、单独标识风险，不能共享 Secure Runtime 的信任声明。

## 平台影响

避免把旧插件中的 Windows/macOS 假设带入 GNOME Wayland。迁移工具应报告平台能力差异，而非伪造兼容。

## 迁移与回滚

提供插件开发迁移文档和必要的数据导入路径。由于首阶段不执行旧插件，不存在运行时回滚；用户可以并行保留旧 ZTools。

## 验证方式

- Secure Runtime 测试证明不存在旧 API 和 Node/Electron 逃生口。
- 选择有代表性的旧插件，仅提取行为和 API 使用清单，用来校验新模型覆盖率。
- 产品文档明确版本与兼容边界。

## 实施记录

决策已接受，尚未实施。
