# 旧 ZTools 只读行为审计

- Status: accepted
- Progress: completed
- Required before: Gate 2 implementation
- Audit owner: zhangchonghao
- Verification owner: zhangchonghao
- Source: `/home/void/work/projects/ZTools` at commit `bef0715277ecef56298ee526eebbab89cf9f2abf`
- Audited on: 2026-08-26

本轮只读审计范围：旧项目 README、主窗口管理、搜索结果计算、搜索结果导航、主窗口 Renderer 事件处理、已有搜索 E2E、窗口焦点回归测试和相关纯算法测试。没有运行旧项目、没有加载插件代码、没有修改旧工作区，也没有把旧项目的依赖、Manager、preload 或 IPC 结构迁入 vNext。该审计已覆盖首个 Host Slice 所需的用户行为、失败案例、可复用纯算法和明确放弃项；插件协议的深入审计和数据迁移样本明确延后到 Gate 3/Gate 5。

本审计只提取旧项目知识，不为复制旧架构提供授权。开始审计时必须记录旧项目 commit，并保持旧工作区只读。

## 用户可见行为清单

以下是从源码和测试确认的行为事实，不是 vNext 的自动产品承诺。

| 编号 | 触发与动作 | 旧项目可见结果 | 平台差异/失败语义 | 证据 |
| --- | --- | --- | --- | --- |
| LB-01 | macOS `Option+Z`、Windows `Alt+Z` 呼出 | 隐藏/失焦时显示并激活；已聚焦且可见时再次触发隐藏 | 快捷键注册失败回滚旧快捷键；双击模式有瞬时 blur 抑制 | `README.md`；`windowManager.ts:710-825` |
| LB-02 | 呼出窗口 | 记录呼出前活动窗口；移动到鼠标所在显示器，恢复该显示器位置或居中 | 活动窗口在黑名单时不显示；焦点恢复按平台实现 | `windowManager.ts:886-1004` |
| LB-03 | 窗口失焦或按 Esc | Windows/Linux 隐藏窗口并尝试恢复前一窗口；macOS 使用 `app.hide()` | Linux 对 blur、托盘和拖拽有延迟/抑制处理；恢复失败只记录日志 | `windowManager.ts:220-280、1006-1029` |
| LB-04 | 空查询 | 显示最近命令和固定项；可关闭最近项 | 结果按行数折叠；不显示“空结果错误” | `SearchResults.vue:178-205`、`navigationGrid.ts` |
| LB-05 | 普通查询 | 名称、拼音、拼音缩写、acronym 模糊匹配；完全/连续匹配和系统应用有排序权重 | 查询长度超过 32 时跳过 Fuse；仍可得到规则匹配 | `commandDataStore.ts:1364-1465`、`stores/commandUtils.ts` |
| LB-06 | 规则匹配或粘贴文本/图片/文件 | regex、over、img、files 按输入上下文进入不同结果区 | 对应能力缺失通常显示空列表；统计加载失败不阻塞搜索 | `useSearchResults.ts:100-240` |
| LB-07 | 结果浏览 | 聚合模式是二维导航网格；列表模式是一维去重列表；方向键循环选择 | 新查询重置选择；折叠区域改变可见网格 | `SearchResults.vue`、`navigationGrid.ts`、`tests/renderer/navigationGrid.test.ts` |
| LB-08 | 点击或 Enter | 通过命令身份和输入 payload 调用旧 launch 入口 | 启动失败主要记日志；部分操作返回 `{ success, error }` 或 alert | `SearchResults.vue:633-755`、`App.vue:877-900` |
| LB-09 | 搜索页连续按 Esc | 依次清空查询、清除粘贴状态、隐藏窗口 | 插件视图另有分步退出；设置可改变 Esc 语义 | `App.vue:504-548` |
| LB-10 | 结果排序 | 插件按 `path + featureCode`，非插件按 `name + path` 去重；使用次数影响排序 | 使用统计失败只产生诊断日志 | `useSearchResults.ts:1-38、238-290` |
| LB-11 | 页面或动作失败 | Main/Renderer 记录错误，缺少统一用户错误契约 | vNext 不迁移字符串异常或通用 launch | `windowManager.ts:450-465`、`SearchResults.vue:710-755` |

首个 vNext Host Slice 只保留 LB-01/02 的窗口语义、LB-04/05 的本地宿主搜索、LB-07 键盘导航、LB-08 一个宿主动作和 LB-09 搜索页 Esc。粘贴上下文、插件、窗口匹配、历史持久化和旧 launch 兼容不进入第一切片。

## 代表性旧插件 API 使用

已对三个静态样本完成初步盘点，没有运行插件代码：`internal-plugins/system/public/plugin.json`、`internal-plugins/setting/public/plugin.json`、`docs/examples/provider-example/{plugin.json,preload.js}`。

| 样本 | 静态能力 | 输入/输出特征 | vNext 结论 |
| --- | --- | --- | --- |
| system | 字符串命令、regex URL/路径、window/files 上下文命令 | 查询文本、当前窗口、文件列表；动作结果没有统一返回契约 | 不进入首个 Host Slice；未来拆为声明式 Action + Capability |
| setting | UI 路由、over 文本、files 安装/配置动作 | 查询、文件路径、路由参数；依赖宿主设置特权 | 不以“内置插件”绕过 Host 信任根；未来由 Host UI/专用 Contract 承载 |
| provider-example | `providers` 声明、`registerProvider` handler | translation `{text,from,to}` / OCR `{image,lang}` 到结构化结果 | Gate 3/4 另行设计；不运行、不迁移旧 preload |

静态 API 名称主要包括 `registerProvider`、`hideMainWindow`、`setSubInput`、`setSubInputValue`、`outPlugin`、`shellOpenExternal` 和大量 `ztools.internal.*`。这些名称本身不足以成为 vNext Contract；必须按 Capability、调用者、Schema、权限和取消语义重新设计。

## 失败案例目录

| 编号 | 旧项目风险 | vNext 处理 |
| --- | --- | --- |
| LF-01 | 快捷键被占用，需要注册失败和回滚 | Capability 返回稳定 `conflict/unavailable`，Adapter 契约覆盖 |
| LF-02 | Windows 呼出/双击后有瞬时 blur 焦点竞态 | Window Capability 状态机与可取消恢复，不复制 timer 堆叠 |
| LF-03 | Linux blur、托盘、拖拽事件顺序不稳定 | 明确平台降级，真实会话 E2E 验证，不绕过 Wayland 授权 |
| LF-04 | 活动窗口恢复可能失败且仅记录日志 | 返回成功/受限/失败状态和用户文案 |
| LF-05 | 启动失败主要靠日志或 alert | 使用稳定错误信封、取消、超时和恢复建议 |
| LF-06 | 搜索依赖 Renderer 全局 Store 和统计读取 | Search Application 拥有取消、预算、增量结果和 Provider Port |
| LF-07 | 裸 IPC、通用 preload、特权插件入口 | 明确放弃，遵循 Contract Gateway/Secure Runtime |

## 数据迁移样本

尚未开始。首个 Host Slice 不读取旧数据库；若后续需要迁移，另行收集脱敏样本、所有权和版本化导入设计。

## 可复用纯算法候选

候选为“结果去重键计算”和“二维导航网格分行”。两者输入输出明确，但不直接复制旧代码；实现时用 vNext 类型重写并补空结果、重复项、折叠和循环导航测试。

## 明确放弃的旧行为

| 旧行为 | 原因 | 替代 |
| --- | --- | --- |
| 插件直接访问 Node/Electron/宿主特权 API | 违反安全边界 | Secure Runtime + Capability |
| 通用 `window.ztools.launch`/裸 IPC | 没有版本、身份、Schema、取消语义 | 专用 Host Action Contract |
| Renderer 全局 Store 作为跨层协议 | 难以取消、限额和跨平台测试 | Search Application + Provider Port |
| 旧平台焦点补丁直接复用于 Wayland | 平台模型不同 | Capability 状态和 Portal/桌面 Adapter |

## 禁止复制清单

- 大型 Manager 和全局单例互调。
- preload 与裸 IPC 注册结构。
- 旧插件权限和内部特权插件模型。
- 业务层平台条件分支。
- 关闭 sandbox、context isolation 或 web security 的配置。

## 完成条件

- 审计来源 commit 和样本范围明确。
- Gate 2 用户旅程均能追溯到新产品决定、旧行为证据或明确的新设计。
- 所有迁入候选经过新边界评审，未复制旧项目耦合。
- 产品负责人确认明确放弃项。

首个 Host Slice 范围的审计已完成并获接受。代表性插件 API 的深入审计、数据迁移样本和真实平台失败证据不属于本审计的完成条件，分别延后到 Gate 3、Gate 5 及对应平台集成评审；它们不能被本文件的 `completed` 状态替代。
