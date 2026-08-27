# Gate 2 首个宿主搜索切片实施进度评审

- Status: validation-pending
- Implementation: implemented-for-current-slice
- Recorded: 2026-08-26
- Technical implementation owner: development agent under delegated technical authority
- Verification owner: zhangchonghao
- Product scope authority: zhangchonghao

## 状态分类

本记录将 Gate 2 内容分开记录：

- `implemented-and-verified`：当前切片代码已实现，并有自动化或手动证据。
- `implemented-real-environment-pending`：当前切片代码已实现，但真实桌面、设备或辅助技术证据尚未取得。
- `not-implemented-in-this-slice`：当前切片明确排除，不能直接验证。
- `future-candidate`：后续阶段候选，不是当前实现承诺。

## 已实现范围

已在不改变已接受产品边界的前提下完成首个 Host Slice 的本地实现：

- 平台无关 Search Domain/Application：Unicode 规范化、匹配等级、稳定排序、去重、选择保持、可取消 session、Provider 失败隔离和内存命令 Provider。
- Host Contract/Gateway：严格 Schema、连接/session 所有权、sequence、事件时间戳、64 KiB 事件上限、每批 50 条、4 批 ack 背压、跨连接拒绝、随机 action token 和连接撤销清理。
- Electron Main/preload/Host UI：命名 Bridge、搜索结果增量显示、旧查询替换、键盘导航、分步 Esc、唯一宿主隐藏动作和独立焦点恢复状态；Electron 原生 `hide` 事件会撤销事件发生时可信连接拥有的 Search Gateway 资源，Renderer 在已提交隐藏、新查询和卸载时同步释放本地 Search Handle。
- Launcher Visibility / Previous App Focus Capability：两个独立 ID 和五维状态快照、平台无关 Port、Fake Adapter、独立 Electron Launcher Adapter、命名 `host.window.visibility.set` Contract，以及显示 `ready`、焦点恢复 `unavailable` 的独立降级表达。
- 数据边界：搜索 query、result payload 和使用历史没有写入持久化存储；命令和 session 只存于当前进程。

以上内容属于 `implemented-and-verified`。自动化证据以本记录的验证结果为准；基础用户可见行为已经在 Ubuntu GNOME Wayland 手动复测通过。

## 已实现但真实环境证据待补

以下不是缺少代码，而是尚未在目标真实环境中完成验证：

- GNOME Shell 扩展安装/启用后的真实 Previous App Focus。
- 正常 GNOME Wayland 用户会话中的 Shell restart、工作区和多显示器行为。
- Windows/macOS 真实交互式桌面中的召回、焦点和多显示器行为。
- Orca、Narrator、VoiceOver 和真实系统高对比度人工复查。

隔离 GNOME Shell/Wayland smoke 和三平台 GitHub Actions 只能证明协议、自动化和构建/启动路径，不能升级为上述真实环境证据。

## 当前切片未实现且明确排除

以下项目不在当前 Host Search 切片中，当前没有可供手动验收的实现：

- 原生全局快捷键。
- 真实应用发现/启动。
- 文件搜索、剪贴板输入、网络 Provider。
- 第三方插件、市场、账号、持久化历史和 SQLite 数据存储。

## 验证结果

本地当前证据：

- 171 项常规测试通过。
- 5 项压力/性能测试通过，包括 1,000 次 session 替换、2,000 条固定命令/100 次查询的首批 p95 ≤ 100ms 测量。
- 全部 workspace 类型检查、ESLint、Prettier、dependency-cruiser 和 Electron 安全门禁通过。
- Electron E2E 通过：Host UI、Bridge 白名单、Renderer 无 Node、搜索结果替换、分步 Esc/空查询 Esc 隐藏、24 次 reload/连接撤销、弹窗/导航拒绝、Enter 隐藏动作，显示/焦点两个五维 Capability 状态的独立展示，以及 combobox/listbox/option、活动选项和选择状态语义；搜索反馈使用独立 atomic live region，错误使用 assertive alert，空状态不进入 listbox。Chromium forced-colors 模式验证系统高亮选中态和至少 2px 的焦点轮廓，200% Electron 缩放验证无横向溢出且搜索输入继续可见、聚焦。Main 的无载荷 `ztools.search.hidden-cleanup` 诊断证明隐藏后活动 session、未确认批次和容量等待者均为 0；独立 Renderer 崩溃场景先验证崩溃前存在未确认搜索批次，再由 `render-process-gone` 清理旧连接并证明三项资源归零。随后两次只加载打包内固定 Host 文档，均建立新连接 epoch 并验证 Host 就绪、输入聚焦和 Bridge 可用；第三次崩溃达到固定预算后以错误状态退出，不进入无限重载。真实第二个 Electron 进程取得单实例锁失败后正常退出，首实例通过 Launcher Capability 召回隐藏窗口，验证只保留一个 BrowserWindow 且搜索输入重新聚焦。
- 当前 Ubuntu/Electron 会话完成 30 次隐藏后召回测量；“可交互”固定为 show Contract 已提交、下一渲染帧完成且搜索框可获得焦点，本地 p95 ≤ 300ms 门禁通过。
- Window Visibility 输出现在经过独立运行时 Schema、固定 Capability ID 和 committed/observed 一致性校验；Adapter 抛错映射为 `unknown + query-status-first`，窗口不存在时状态明确为 `health=unavailable`。
- Electron Launcher Adapter 已从 Main Composition Root 提取，契约测试覆盖窗口缺失/销毁、show/hide 成功、Electron 观测未变化时 `unknown`，以及隐藏提交与 Previous Focus unavailable 解耦。
- GNOME Previous Focus 已完成纯协议客户端、防重放状态机、可注入 Capability Adapter、仓库内 GNOME Shell 50 扩展和 Main 侧受控 GDBus Transport：固定 v1、无目标请求、nonce/sequence/deadline、单在途请求、4/秒速率限制、扩展 epoch 撤销、同 UID 检查、固定单方法、候选窗口生命周期、Host 前台/短期过渡条件和依赖降级均有测试。Main 只在 Linux GNOME Wayland 下探测并组合，且隐藏提交后才请求恢复；启动与成功召回触发去重依赖刷新，Transport 失败立即降级，不使用后台轮询。本机只读 Session Bus 和扩展列表确认当前扩展未安装/启用，Wayland smoke 与 E2E 验证产品正确报告 `supported/missing/unavailable` 并继续正常隐藏。
- GNOME 50.1 隔离 headless Shell 使用独立 HOME/XDG、Session Bus 和虚拟 Wayland monitor 完成稳定原生集成 smoke：官方扩展 enable/disable 成功，固定 `RestorePreviousFocus` 可 introspect，Main 的受控 GDBus Transport 实际连通，重放被拒绝，disable 后服务撤销，reenable 后 epoch 轮换；测试终止第一代 Shell 并启动不同 PID 的第二代 Shell，确认服务恢复，同一旧 Host client 返回 `focus.extensionEpochChanged` 后进入 `focus.sessionRevoked`。该稳定门禁已连续独立运行三次通过。候选窗口 `unmanaged`、候选替换和活动工作区变化会主动清理候选/过渡状态，disable 同步释放信号与状态机；这些清理语义由纯状态机测试和真实扩展加载/释放覆盖。
- 当前不包含网络功能的 Host 切片已在 Chromium、Electron Session 和 Renderer CSP 三层默认拒绝远程网络与权限请求；原生 Wayland smoke 复测不再出现此前的外部 SSL 握手尝试。
- Main/preload/Renderer 生产构建通过。
- Linux x64 平台原生目录产物已经从最小运行时 staging 生成并直接启动，打包后的 Host ready 且 Renderer 继续无法访问 `process`/`require`；三平台 CI 已在对应 runner 实际执行同一产物 smoke，见提交 `70ce0293d74d4cd32956aeec320126c9511c3722` 的运行 [33033812484](https://github.com/WYYAHYT/ZTools/actions/runs/33033812484)。

## 未完成与不作虚假推断的证据

- Gate 1 已关闭；关闭评审只确认工程基线和自动化证据，不把本地 Ubuntu 证据当作真实 Windows/macOS 或正常 GNOME Wayland 用户会话证据。
- 桌面入口重复启动召回已验证；Gate 2 入口明确排除的原生全局快捷键仍未实现，两者不互相替代。
- Windows x64、macOS arm64 的真实交互式桌面启动/E2E 尚未验证；GitHub 云 CI 的自动化启动/E2E 已通过，但不能替代真实设备证据。
- Ubuntu Electron Wayland 的 Electron 44 固定 Vulkan 兼容输出已通过参数矩阵解释并进入严格 smoke 分类：保留硬件加速，精确单行报告为 `expected-warning`，其他 Electron `ERROR`、重复警告和 stderr 超限均阻断。该处置关闭了“未解释警告”工程缺口，但不等于完成真实 GPU、多显示器或目标平台性能验证。
- Previous App Focus 已有 GNOME 50.1 原生 headless Shell、虚拟 Wayland monitor、Shell PID 重启、旧 client 撤销和真实 D-Bus 证据；工作区与候选销毁清理语义已有自动测试。隔离 Shell 不提供可依赖、且不扩大产品权限的外部前台窗口控制接口，因此真实 GTK 候选恢复和候选退出两个脚本不再属于强制 headless 门禁：它们只在 GTK 自身明确报告窗口 active 后继续，不使用 Shell `Eval`、`FocusApp`、固定大等待或自动重试。历史成功样本保留，但不能替代当前用户正常桌面会话中的焦点恢复、Shell restart、多显示器/DPI、工作区或辅助技术发布级证据。当前用户目录未安装或启用扩展，产品在该会话仍保持明确降级，不伪造成功。
- 当前 Ubuntu/Electron 召回 p95 门禁通过不等于三个目标平台或完整 GNOME 集成均达标；Windows、macOS 和 GNOME 平台 Adapter 仍需使用同一测量定义取得真实会话证据。
- atomic live region、alert、组合框关系、forced-colors 和 200% 缩放已有自动化证据，但不能代替 Windows Narrator、macOS VoiceOver 与 GNOME Orca 的实际语音顺序、键盘浏览和真实系统高对比度人工复查。
- Gate 2 不标记完成，平台支持不标记为正式 Supported；当前切片未实现的功能不纳入本轮验证。

## 后续门禁

继续完成已实现能力的 Windows/macOS 真实会话、Ubuntu Wayland Launcher Visibility/Previous App Focus 集成，以及三个平台的辅助技术与召回性能复查；三平台 CI 自动化已完成，不再作为 Gate 2 的未完成 CI 项。未实现的全局快捷键、应用启动和插件能力不纳入本轮验证，需在后续功能切片中另行设计和开发。完成后由独立评审记录决定是否转换 Gate 状态。
