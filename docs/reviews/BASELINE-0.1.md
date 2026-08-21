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

首次安装依赖或生成工程骨架前，仍必须接受 `ENGINEERING_BASELINE.md`，固定精确 Node、pnpm、Electron、CI runner 和目标架构。其余后续 Gate 阻断项继续以 `OPEN_ITEMS.md` 为准。

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

“项目设计讨论”是基线创建前的批准来源。首个基线提交已经创建并回填哈希；本轮未创建可选标签。此记录不伪造不存在的 Issue、PR 或会议链接。

## 独立评审处置

| 评审意见 | 处置 |
| --- | --- |
| Gate 0 没有闭环 | 接受；本记录、README 与 ROADMAP 明确标记为待最终评审和首个提交。 |
| Gate 1 关键设计缺失 | 接受；登记为 Gate 1 前置阻断项，并建立 ADR-0009、ADR-0010 与错误模型草案。 |
| 依赖方向和契约所有权有歧义 | 接受；在 ARCHITECTURE 中增加依赖矩阵、所有权和禁止依赖。 |
| Capability 状态不是单一维度 | 接受问题判断；建立 proposed ADR-0011 比较并定义多轴候选，维护者接受前不固化 Schema。 |
| 技术栈被错误打包进 ADR-0001 | 接受；ADR-0001 仅保留从零模块化单体范围，技术栈交由 ADR-0009。 |
| 产品缺少可验收规格 | 接受；不在 Gate 0 猜测指标，改为 Gate 2 前阻断交付物。 |
| 安全文档不是完整威胁模型 | 接受；新增 THREAT_MODEL 草案并按功能 Gate 补齐。 |
| 开放事项缺少统一登记 | 接受；新增 OPEN_ITEMS。 |
| 平台 CI 基线不具体 | 接受；作为 Gate 1 实现前阻断项，要求固定 runner、OS、CPU 和 Electron 窗口。 |
| ADR 批准可追溯性弱 | 接受；扩充 ADR 元数据并链接本记录。 |
| 旧项目行为知识未成为交付物 | 接受；登记 Gate 2 前的只读行为审计。 |
| PRODUCT 旧插件表述过时 | 接受；已改为首阶段不直接运行旧插件。 |

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

在 `ENGINEERING_BASELINE.md` 被接受前，不得首次安装依赖、生成实际工程骨架或固定工具版本。Gate 1 退出前仍必须实现并验证架构边界检查、安全配置、Contract Gateway 最小闭环和三平台 CI。
