# ADR-0001：从零建设模块化单体

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
- Related: [VISION](../VISION.md), [ARCHITECTURE](../ARCHITECTURE.md)

## 背景

旧 ZTools 已积累可用功能和宝贵经验，也积累了大型管理器、全局耦合、宽 preload、裸 IPC、平台分支散布和安全配置放宽等结构性负担。在原结构内逐步修补会迫使新安全模型与平台模型持续迁就旧边界。

项目需要同时面向 Windows、macOS 和 Ubuntu 26.04 GNOME Wayland，并建立新的插件契约。它不是一次局部 Linux 适配。

## 决策驱动因素

- 能在不继承旧耦合的前提下建立安全边界。
- 控制早期部署和调试复杂度。
- 支持小型纵向切片与未来按风险拆分进程。
- 保留旧项目中的产品知识和测试价值。

## 考虑的方案

### 方案 A：继续演进旧仓库架构

短期可复用更多代码，但新边界会受旧 IPC、插件信任和平台假设约束，难以证明安全性与依赖方向。

### 方案 B：从零建设模块化单体

建立独立 vNext 设计与工程，仅在审查后迁入行为、测试、数据兼容知识和少量纯算法。安全或故障边界按需使用独立运行单元。

### 方案 C：从第一天采用微服务式多进程架构

隔离清晰，但会在产品假设尚未验证时引入大量部署、协议、调试和状态一致性成本。

## 决策

选择方案 B。

ZTools vNext 从空的 `vnext` 分支建设，采用模块化单体作为默认架构；在插件沙箱、后台 Worker、重计算和窄平台辅助等明确边界处拆分进程。

本 ADR 不决定具体工程技术栈。早期候选稿曾把 Electron、Vue 3、TypeScript 和 pnpm workspace 一并写入本决策；Gate 0 独立 review 认定其缺少候选比较，因此在基线冻结前将该部分拆分到 proposed [ADR-0009](0009-engineering-technology-stack.md)。ADR-0009 被接受前不得据此创建工程骨架。

旧 `/home/void/work/projects/ZTools` 只读参考，复用知识而不默认复用结构。

## 后果

### 正面

- 可以从第一天建立正确依赖方向和安全默认值。
- 不需要同时维护新旧架构之间大量中间状态。
- 模块可以先在单一仓库内演进，再根据测量拆分运行单元。

### 代价与风险

- 初期功能数量少，需要重新实现基础能力。
- 旧行为可能遗漏，必须主动建立行为清单与测试样本。
- “从零”可能诱发过度设计，因此路线图要求以纵向切片验证。

## 安全、隐私与权限影响

此选择使默认安全插件运行时和调用身份可以成为基础，而不是兼容层补丁。迁入旧代码仍需逐项安全审查。

## 平台影响

三个目标平台从同一产品语义和 Capability 设计开始，不以现有 Windows/macOS 实现作为 Linux 的强制模板。

## 迁移与回滚

当前无 vNext 用户数据。若未来需要迁移旧数据，使用显式导入工具，不直接让新核心读取旧内部数据库。回滚意味着继续使用旧项目，而不是把 vNext 结构合回旧架构。

## 验证方式

- CI 检查包依赖方向和安全配置。
- 每个阶段通过纵向切片证明架构可交付用户价值。
- 旧代码迁入评审必须说明其知识来源与新边界适配。

## 实施记录

尚未实施；当前仅建立 Design Baseline 0.1。
