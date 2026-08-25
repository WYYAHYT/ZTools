# Design Baseline 0.1 评审记录

- Status: accepted
- Review opened: 2026-08-21
- Baseline owner: zhangchonghao
- Review accepted: 2026-08-21
- Baseline commit: `3a5ad77` (`docs: establish design baseline 0.1`)
- Baseline tag: not created; optional and not required to close Gate 0
- Gate 1 authorization: granted for design and engineering preparation

## 当前结论

维护者已接受 Design Baseline 0.1、独立评审处置、ADR-0009 至 ADR-0011 与错误模型。Gate 0 关闭，允许开始 Gate 1 的设计与工程准备。

创建正式 workspace、提交正式锁文件或安装正式产品依赖前，仍必须接受 `ENGINEERING_BASELINE.md`，固定精确 Node、pnpm、Electron、CI runner 和目标架构。接受前可以继续版本调研和设计隔离、可丢弃的验证原型；真正下载依赖、使用云 CI 或远程设备时需要对应外部操作权限。其余后续 Gate 阻断项继续以 `OPEN_ITEMS.md` 为准。

## 决策记录

| 日期 | 决策 | 决策者 | 依据 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-08-21 | ADR-0001 至 ADR-0005 的基础架构方向 | zhangchonghao | 项目设计讨论；基线提交 `3a5ad77` | accepted |
| 2026-08-21 | ADR-0006：首阶段不运行旧插件 | zhangchonghao | 维护者明确接受推荐方案；基线提交 `3a5ad77` | accepted |
| 2026-08-21 | ADR-0007：Portal/D-Bus + 可选 GNOME Shell 扩展 | zhangchonghao | 维护者明确接受推荐方案；基线提交 `3a5ad77` | accepted |
| 2026-08-21 | ADR-0008：SQLite + 插件命名空间 + 附件 + 系统密钥库 | zhangchonghao | 维护者明确接受推荐方案；基线提交 `3a5ad77` | accepted |
| 2026-08-21 | 独立文档 review 意见纳入基线 | zhangchonghao | 维护者提供的独立 Agent review；处置结果已逐项记录 | accepted |
| 2026-08-21 | 接受独立 review 处置与修订后的主题文档 | zhangchonghao | 维护者明确回复“我审阅了，同意”；基线提交 `3a5ad77` | accepted |
| 2026-08-21 | 接受 ADR-0009、ADR-0010、ADR-0011 与 `ERROR_MODEL.md` | zhangchonghao | 维护者明确回复“我审阅了，同意” | accepted，implementation pending |
| 2026-08-21 | 关闭 Gate 0，授权开始 Gate 1 设计与工程准备 | zhangchonghao | 本评审记录与 `OPEN_ITEMS.md` 中继续有效的工程基线阻断项 | granted |
| 2026-08-21 | 采纳进一步 review 的工程基线循环、Gate 1 安全切片、状态拆分和结果确定性问题 | zhangchonghao | 维护者要求“根据意见修复”；ADR-0012 仍需单独决定 | accepted remediation; decision pending for ADR-0012 |
| 2026-08-21 | 既定产品范围内的日常技术决策委托给开发 agent | zhangchonghao | 维护者指示“由你负责技术决策；涉及产品方向、费用或外部权限时再问我”，并要求后续 agent 使用其能理解的审批沟通 | accepted delegated authority |

委托范围和后续沟通格式见 [维护者沟通与审批规则](../MAINTAINER_COMMUNICATION.md)。该委托不允许 agent 改变产品方向、承诺费用、操作外部账号/服务、扩大权限或执行不可逆动作；这些事项仍需维护者知情决定。

“项目设计讨论”是基线创建前的批准来源。首个基线提交已经创建并回填哈希；本轮未创建可选标签。此记录不伪造不存在的 Issue、PR 或会议链接。

## 独立评审处置

下表区分评审发生时决定采取的动作与当前结果，避免把历史处置误读为尚未完成的当前状态。

| 评审意见 | 当时处置决定 | 当前结果 |
| --- | --- | --- |
| Gate 0 没有闭环 | 建立评审记录，完成最终评审和首个提交后再关闭 | Gate 0 已关闭；baseline `3a5ad77`，Gate 1 设计准备已授权 |
| Gate 1 关键设计缺失 | 登记 Gate 1 阻断项，建立 ADR-0009、ADR-0010 与错误模型 | 三者已接受；实施验证仍待 Gate 1 完成 |
| 依赖方向和契约所有权有歧义 | 增加依赖矩阵、所有权和禁止依赖 | ARCHITECTURE 与 ADR-0010 已接受；自动边界检查尚未实现 |
| Capability 状态不是单一维度 | 建立 ADR-0011 比较多轴模型 | ADR-0011 与 PLATFORM_CAPABILITIES 已接受；实现验证待完成 |
| 技术栈被错误打包进 ADR-0001 | ADR-0001 只保留从零模块化单体，技术栈交由 ADR-0009 | ADR-0009 已接受；精确版本由 ENGINEERING_BASELINE 阻断 |
| 产品缺少可验收规格 | 不在 Gate 0 猜测指标，建立 Gate 2 前阻断交付物 | HOST_VERTICAL_SLICE 模板已建立，仍为 draft/not-started |
| 安全文档不是完整威胁模型 | 新增跨 Gate 威胁模型并按功能切片补齐 | 总模型为 draft；Gate 1 Host Gateway 切片已建立、待接受 |
| 开放事项缺少统一登记 | 新增 OPEN_ITEMS | 已建立，并进一步拆分设计状态与执行进度 |
| 平台 CI 基线不具体 | 作为正式工程骨架前阻断项，固定 runner、OS、CPU 和 Electron 窗口 | ENGINEERING_BASELINE 为 draft/researching；允许授权后运行可丢弃验证原型 |
| ADR 批准可追溯性弱 | 扩充 ADR 元数据并链接本记录 | 已完成；accepted ADR 指向 baseline `3a5ad77` |
| 旧项目行为知识未成为交付物 | 登记 Gate 2 前的只读行为审计 | LEGACY_BEHAVIOR 模板已建立，仍为 draft/not-started |
| PRODUCT 旧插件表述过时 | 改为首阶段不直接运行旧插件 | 已完成并接受 |

## 进一步评审处置

| 评审意见 | 处置 | 当前结果 |
| --- | --- | --- |
| 工程基线接受条件形成循环 | 允许维护者授权隔离、可丢弃的验证原型；正式 workspace 仍受工程基线阻断 | 循环已解除；ENGINEERING_BASELINE 保持 draft/researching，尚未授权执行原型 |
| Gate 1 威胁模型阻断登记不完整 | 建立 Host Renderer/Contract Gateway 专用切片，并登记到 OPEN_ITEMS 与 ROADMAP | 切片为 draft/in-progress；接受前阻断 Gateway 实现 |
| Gate 1 负责人未具体化 | 为 implementation、工程基线验证、Gateway 验证和安全评审指定具体负责人 | Gate 1 相关责任均由 zhangchonghao 承担 |
| 基线记录与威胁登记保留旧时态 | 区分“当时处置决定”和“当前结果”，更新 accepted/未验证证据表述 | 已完成 |
| OPEN_ITEMS 混用设计状态和工作进度 | 拆成设计状态、执行进度、Accountable owner 与 Verification owner | 已完成；未创建文档使用 `—`，不提前宣称 draft |
| Application 依赖描述过于绝对 | 使层级简述与包级依赖矩阵一致 | 已明确可依赖本模块 Domain、owned Ports 和必要 Public Module Contract |
| `outcome-unknown` 与 category 关系不明确 | 建立 ADR-0012 比较正交 `effectOutcome` 模型 | ADR-0012 为 proposed，尚未改变现行 ERROR_MODEL，阻断 Gateway 结果 Schema |

## Gate 0 关闭清单

- [x] `PRODUCT.md` 经维护者最终评审并转为 `accepted`。
- [x] `ROADMAP.md` 经维护者最终评审并转为 `accepted`。
- [x] 修订后的 `ARCHITECTURE.md` 经维护者最终评审并转为 `accepted`。
- [x] `PLATFORM_CAPABILITIES.md` 与 ADR-0011 的处置一致，并经维护者最终评审转为 `accepted`。
- [x] 本轮独立 review 的处置结果经维护者确认。
- [x] OPEN_ITEMS 中 Gate 1 前置项的范围、负责人和处理顺序经维护者确认。
- [x] ADR-0009、ADR-0010、ADR-0011 与 ERROR_MODEL 已由维护者接受。
- [x] 所有本地文档链接、状态索引和格式检查通过。
- [x] 已创建首个基线提交 `3a5ad77`，并在本文件记录。
- [x] 标签是可选项；本轮不创建标签，不阻断 Gate 0。
- [x] 维护者已明确允许开始 Gate 1 的设计与工程准备。

## Gate 1 授权记录

2026-08-21，维护者 zhangchonghao 授权开始 Gate 1 的设计与工程准备。允许范围包括工程基线定版、边界检查设计、CI 设计与最小工程骨架准备。

在 `ENGINEERING_BASELINE.md` 被接受前，不得创建正式 workspace、提交正式锁文件或安装正式产品依赖。为形成接受证据，可以在隔离环境设计并执行范围已记录的可丢弃验证原型；涉及下载、云 CI 或远程设备时必须取得对应外部操作权限，且原型不得直接合入。Gate 1 退出前仍必须实现并验证架构边界检查、安全配置、Contract Gateway 最小闭环和三平台 CI。
