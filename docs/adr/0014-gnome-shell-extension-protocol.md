# ADR-0014：GNOME Shell 扩展使用最小化焦点恢复协议

- Status: accepted
- Proposed: 2026-08-26
- Accepted: 2026-08-26
- Deciders: development agent under delegated technical authority
- Approval record: [Maintainer communication and delegated authority](../MAINTAINER_COMMUNICATION.md), [Gate 2 implementation progress](../reviews/GATE2-IMPLEMENTATION-PROGRESS.md)
- Reviewers: development agent platform/security review; current GNOME Shell 50.1 environment audit
- Verification owner: zhangchonghao
- Review by: before enabling the extension outside an isolated test profile, and on every GNOME Shell major upgrade
- Supersedes: none
- Superseded by: none
- Related: [ADR-0007](0007-gnome-wayland-integration.md), [ADR-0011](0011-multidimensional-capability-state.md), [THREAT_MODEL](../THREAT_MODEL.md), [HOST_VERTICAL_SLICE](../specs/HOST_VERTICAL_SLICE.md)

## 背景

Ubuntu 26.04 GNOME Wayland 不允许普通 Electron 客户端枚举或任意激活其他应用窗口。ADR-0007 已接受“标准路径 + 用户可选、职责最小的官方 GNOME Shell 扩展”，但尚未确定扩展与 Host 的协议、身份边界和生命周期。当前实机环境是 GNOME Shell 50.1，未安装 ZTools 扩展；Host 已能独立显示和隐藏，Previous App Focus 明确降级为 `unsupported/unavailable`。

首个扩展只解决一个产品语义：ZTools 隐藏后，尽可能恢复 ZTools 获得焦点前的那个窗口。它不提供窗口枚举、按 ID 激活任意窗口、Shell eval、命令执行、输入注入或插件调用入口。

## 决策驱动因素

- 遵守 Wayland 与 GNOME 的窗口所有权和用户授权模型。
- 即使扩展缺失、禁用、崩溃或版本不兼容，核心搜索与窗口隐藏仍正常工作。
- 不把 GNOME 私有窗口对象、D-Bus 方法或扩展状态泄漏到跨平台业务层和插件 API。
- 防止 Renderer、插件和任意猜测方法名的调用者直接获得 Shell 特权。
- Shell 重启、Host reload 和升级后旧会话必须失效，不能继续使用陈旧窗口引用。
- 协议足够窄，能够在 GNOME 版本变化时审计和回滚。

## 考虑的方案

### 方案 A：扩展导出通用窗口控制 D-Bus API

Host 传入窗口 ID、应用 ID 或任意动作，扩展执行查询和激活。实现灵活，但会形成通用特权代理；窗口标识可能被猜测或过期，Renderer/插件一旦越过 Bridge 就可扩大影响。该方案违反 ADR-0007 的最小职责要求，否决。

### 方案 B：固定 D-Bus 方法，Host 传入目标窗口标识

方法白名单较小，但目标选择仍由低信任 Host 进程数据驱动；Wayland/GNOME 窗口标识不稳定，跨 Shell 重启和工作区切换容易指向错误对象。协议还会泄漏 GNOME 私有窗口概念，否决。

### 方案 C：扩展自行维护最近非 ZTools 焦点，只接受无目标参数的恢复请求

扩展在 Shell 内观察焦点变化，只保留一个不可序列化的弱窗口引用和对应生命周期 epoch。Host 只能请求“恢复扩展已经记录的前一窗口”，不能选择任意目标。请求经过 Main 内的平台 Adapter，Renderer 与插件不接触 D-Bus。扩展缺失或状态无效时返回稳定降级结果。

该方案功能最窄、权限最小，且把窗口对象留在拥有它的 Shell 进程中，选择该方案。

## 决策

GNOME Shell 扩展协议版本固定为 `1`，首版只允许以下语义：

1. 扩展在 GNOME Shell 内观察焦点变化，记录“ZTools 获得焦点前最近的、仍可激活的非 ZTools窗口”。记录不得序列化到磁盘，不跨 Shell 重启恢复。
2. Host 通过 Main 内的 GNOME Previous Focus Adapter 调用固定的 `RestorePreviousFocus` 方法。请求只包含协议版本、Host 启动时生成的会话 nonce、单调 request sequence 和 deadline；不接受窗口 ID、应用 ID、命令、脚本或任意参数对象。
3. 扩展返回固定结果：`restored`、`no-candidate`、`candidate-invalid`、`host-not-foreground`、`rate-limited` 或 `protocol-rejected`。跨平台层将其最小化映射为 `restored`、`restricted` 或 `unavailable`，不得把 GNOME 私有原因暴露给插件。
4. Host 只有在自身窗口隐藏操作已经观察为 committed 后才请求恢复。扩展执行前再次确认当前焦点属于 ZTools 或处于同一短期过渡 epoch；未知或不一致状态默认拒绝，避免把其他应用突然抢到前台。
5. 扩展拥有候选窗口引用并在窗口销毁、Shell disable/restart、工作区/会话失效时清除。Host 拥有调用 deadline、取消和状态订阅；Shell 端退出时撤销旧 session nonce 与 sequence。由于固定方法当前由短生命周期 `gdbus` 调用，扩展无法可靠观察 Electron Main 退出；Host 重启后的新 nonce 仅可用 `sequence = 1` 且在扩展确认 ZTools 当前拥有焦点或处于同一隐藏过渡窗口时接管，接管后旧 nonce 立即失效。后台调用者不得替换活动 nonce。
6. 通信使用用户 Session Bus 上固定、版本化的 D-Bus interface，但固定 bus 名称本身不作为认证。Adapter 必须同时校验：
   - D-Bus peer 与 Host 属于当前用户会话；
   - 扩展返回的协议版本、GNOME major compatibility 和随机 extension epoch；
   - Host session nonce 与严格递增 sequence；
   - 调用只来自 Electron Main 内注册的 Adapter，Renderer/插件 Bridge 不暴露该方法。
7. Session Bus 无法对同 UID 的完全恶意本地进程提供密码学隔离。本项目将“已取得同一用户任意代码执行”视为操作系统账户已失陷；实际控制重点是阻断不可信插件/Renderer、重放、陈旧会话、错误版本和意外调用。不得以“仅本机”替代上述协议和进程边界控制。
8. 调用频率上限为每秒 4 次、突发 8 次；超限不执行窗口操作。所有诊断只记录结果类别、协议版本、epoch 变化和耗时，不记录窗口标题、应用名称、查询正文或用户内容。

ZTools 扩展 UUID、D-Bus bus/interface/path 的最终字符串在实现时作为协议常量固定；更改方法集合、目标选择权或信任模型需要新 ADR 或协议主版本。

## 后果

### 正面

- Host 无法要求扩展激活任意窗口，扩展能力被限制为一个用户可理解的恢复动作。
- GNOME 私有窗口引用不跨进程传输，也不进入持久化、日志或插件 API。
- Shell 重启、扩展禁用和版本不兼容都能自然使 epoch 失效并降级。
- Launcher Visibility 的隐藏提交与 Previous Focus 的恢复结果保持独立。

### 代价与风险

- 焦点历史规则需要处理 ZTools 自身多个窗口、系统 UI、锁屏、工作区切换和候选窗口销毁。
- Session Bus 不能抵御已经在同 UID 下执行任意代码的攻击者；该残余风险必须在威胁模型和发布说明中保持明确。
- GNOME Shell 私有 API 随 major 版本变化，扩展必须按 GNOME major 建立兼容矩阵和真实会话测试。
- 扩展安装、升级和启用流程仍未实现；基础产品继续明确降级。

## 安全、隐私与权限影响

- 不新增插件 Permission，插件和 Host Renderer 均不能直接调用扩展。
- 扩展不记录窗口标题、应用列表或历史；只在内存持有一个 Shell 窗口引用。
- Host 不传入用户数据或目标标识；nonce 只用于会话防重放，不作为长期凭据持久化。
- 扩展不请求 Portal 授权，不绕过 GNOME 安全设置，不允许静默安装或启用。
- 安装目录、metadata、D-Bus 导出、日志和更新完整性在实现评审中单独验证。

## 平台影响

- Ubuntu 26.04 GNOME Wayland：兼容扩展存在时 Previous App Focus 可从 `unsupported/unavailable` 升级为依赖 ready；扩展缺失、禁用或不兼容时保持显式降级。
- Windows 与 macOS：不使用该协议，由各自平台 Adapter 实现相同产品语义。
- 其他 Linux 桌面：不因本 ADR 获得支持承诺，也不得尝试调用 GNOME 接口。

## 迁移与回滚

当前没有已发布扩展或持久化协议，无数据迁移。实现可通过不注册 GNOME Adapter 完整回滚，Host 将继续使用现有 `unsupported/unavailable` 快照。升级时若协议或 GNOME major 不兼容，必须先降级而不是尝试旧私有 API。

## 验证方式

- 纯协议测试：未知方法/字段、错误版本、nonce/sequence 重放、受限 Host 重启接管、deadline、速率限制和结果映射。
- 扩展单元/隔离测试：ZTools 前序窗口记录、候选销毁、系统窗口过滤、Shell disable/restart 清理。
- Adapter 测试：扩展缺失、禁用、D-Bus owner 更换、版本不兼容、调用超时和异常映射为五维 Capability 状态。
- GNOME 50.1 原生 Wayland 集成：无扩展、兼容扩展、禁用扩展、旧扩展、Shell 重启、工作区切换和多窗口。
- 安全检查：无通用 eval/命令/窗口 ID 参数；Renderer 与插件 Bridge 无 D-Bus 或恢复方法；日志不含窗口和查询正文。

## 实施记录

协议和安全边界已按委托技术权限接受；已实现纯协议客户端、防重放状态机、可注入 GNOME Previous Focus Adapter、受控 Main 侧 GDBus Transport，以及隐藏提交后再恢复的组合 Adapter，并通过单元测试。仓库内 GNOME Shell 50 扩展使用固定单方法 D-Bus 导出层和纯焦点状态机；受限 Host 重启接管只允许新 nonce 从 `sequence = 1` 且 ZTools 当前拥有焦点或处于隐藏过渡窗口时发生，接管后旧 nonce 失效。扩展订阅候选窗口 `unmanaged` 与活动工作区变化信号：候选销毁时只清除仍由该窗口拥有的引用，工作区变化时同时清除候选与短期隐藏过渡，disable 时撤销状态机并释放全部信号。

GNOME 50.1 隔离 headless Shell、独立 Session Bus 和虚拟 Wayland monitor 已稳定验证扩展加载、固定方法 introspection、Main Transport 实际调用、重放拒绝、disable 服务撤销和 reenable epoch 轮换。隔离测试还终止第一代 Shell 进程并启动不同 PID 的第二代 Shell，确认固定 D-Bus 服务恢复；跨两代 Shell 持续存活的旧 Host client 检测到 extension epoch 变化并自我撤销，后续调用稳定返回 session revoked。该门禁已连续独立运行三次通过。

真实 Electron Host 隐藏后恢复普通 GTK 窗口，以及候选退出后返回 `focus.noPreviousCandidate`，均曾在隔离环境取得成功样本；但 headless Mutter 不提供可依赖、且不扩大产品权限的外部前台窗口控制接口，GTK 候选不能稳定成为前一焦点。因此这两个场景不再计入强制 headless 门禁，独立脚本只在 GTK 明确报告窗口 active 后继续，并明确禁止使用 Shell `Eval`、`FocusApp` 或重试制造成功。候选销毁和工作区变化的主动失效语义仍由纯状态机测试及真实扩展加载/释放覆盖。真实焦点恢复、正常桌面的 Shell restart、多显示器、工作区和辅助技术验证仍待当前用户隔离测试会话完成；当前用户目录未安装或启用扩展，产品在依赖缺失时继续明确报告 Previous App Focus `missing/unavailable`。
