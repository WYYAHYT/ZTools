# Gate 2 首个宿主搜索切片入口评审

- Status: accepted for parallel implementation preparation
- Recorded: 2026-08-26
- Product decision maker: zhangchonghao
- Technical decision maker: development agent under delegated technical authority
- Verification owner: zhangchonghao

## 维护者已作出的产品决定

维护者明确回复“就按照你现在的建议推进”，接受以下同一组紧密相关的首切片范围决定：

- 首个切片只提供简体中文界面。
- 不保存搜索查询、结果正文或使用历史；命令和会话数据只存在进程内，进程退出即丢弃。
- 采用两个工程体验目标：固定数据规模和测量方法下，本地搜索首批结果 p95 ≤ 100ms，窗口召回到可交互 p95 ≤ 300ms。未达标时先分析和优化，不通过隐藏测试放宽目标。

## 用户可见影响与范围

首个版本会提供较小但完整的宿主搜索体验，暂时没有多语言、最近使用个性化或历史排序。它不新增系统权限、不产生费用、不需要外部账号或服务，也不持久化搜索正文。第三方插件、网络 Provider、SQLite、真实应用启动、原生全局快捷键和持久化历史仍不在本切片内。

## 技术决定与实施方式

ADR-0013 已按维护者委托的技术权限接受，规定使用连接绑定、有界、可取消、可 ack 的搜索事件流。Search Domain/Application 将保持平台无关；Host Gateway、Bridge、Host UI 和 Window/Focus Adapter 分层实现，并为未知调用者、方法、字段、会话和 action 默认拒绝。

## Gate 状态与并行范围

Gate 1 已于 2026-08-27 根据 [Gate 1 关闭评审](GATE1-CLOSURE.md) 关闭。提交 `70ce0293d74d4cd32956aeec320126c9511c3722` 的 GitHub Actions 运行 [33033812484](https://github.com/WYYAHYT/ZTools/actions/runs/33033812484) 已通过 Ubuntu、Windows、macOS 三平台自动化矩阵；该证据不等同于真实交互式设备或公开平台支持。因此本记录允许继续进行 Gate 2 的真实平台验证，不把 Gate 2 宣称为已完成。

在本切片的自动化和目标平台证据满足验收规格前，不得把 Gate 2 标记为完成或发布平台支持承诺。Gate 1 的工程自动化前置条件已经完成，但真实平台交互证据仍属于 Gate 2 自身的退出条件。

## 评审结论

产品范围、数据留存和体验目标已接受；Host Vertical Slice 规格与 Gate 2 威胁模型可以进入实现和验证阶段。Gate 1 的未完成项继续单独追踪，不因本评审被关闭或弱化。
