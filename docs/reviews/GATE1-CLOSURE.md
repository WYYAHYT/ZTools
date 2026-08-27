# Gate 1 工程基础关闭评审

- Status: closed
- Recorded: 2026-08-27
- Gate: Gate 1：工程基础与可执行边界
- Technical decider: development agent under delegated technical authority
- Accountable owner: zhangchonghao
- Verification owner: zhangchonghao
- Evidence commit: `70ce0293d74d4cd32956aeec320126c9511c3722`
- CI evidence: [GitHub Actions run 33033812484](https://github.com/WYYAHYT/ZTools/actions/runs/33033812484)

## 结论

Gate 1 已关闭。关闭依据是正式 workspace、最小 Host Renderer/Contract Gateway 链路、架构边界、安全默认值、分层测试和三平台自动化工程验证均已形成可复查证据。该决定只覆盖 Gate 1 的工程基础与可执行边界，不把 CI 通过扩大解释为真实桌面平台支持，也不提前关闭 Gate 2。

## 退出条件核对

| 退出条件 | 结果 | 证据 |
| --- | --- | --- |
| Electron、Vue、TypeScript、pnpm workspace 正式工程骨架 | 已完成 | 正式 workspace、精确锁文件和生产构建已合入 `vnext` |
| Domain、Application、Contracts、Adapters、Delivery 依赖边界 | 已完成 | dependency-cruiser 架构检查通过，业务包未导入 Electron/Vue/Node 平台实现 |
| 类型、格式、Lint、单元、契约和压力测试门禁 | 已完成 | 本地 `pnpm check` 通过；三平台 CI 的静态和常规测试 job 通过 |
| 最小 Contract Gateway | 已完成 | Host Renderer → Bridge → Gateway → Bootstrap 链路；未知方法、身份伪造、Schema 越界、旧连接和资源清理均有测试 |
| Electron 安全默认值 | 已完成 | `contextIsolation`、`sandbox`、`webSecurity` 开启，`nodeIntegration` 关闭；安全回退会使检查失败 |
| 隔离 Electron E2E | 已完成 | 本地及三平台 CI 覆盖 Bridge、导航/reload、Renderer 崩溃恢复、无 Node 和基础 Host 启动 |
| Ubuntu 原生 Wayland 正式应用 smoke | 已完成 | 正式应用在 Ubuntu 26.04 GNOME Wayland 本地会话启动并通过 smoke；Xvfb/X11 结果单独标注 |
| 三平台 CI 与平台原生目录产物 smoke | 已完成 | `ubuntu-26.04`、`windows-2025`、`macos-26` 三个 job 均成功；每个平台均构建并启动对应目录产物 |

## CI 结果范围

运行 `33033812484` 的结果为：

- `Checks (ubuntu-26.04)`：成功，包含静态/单元检查、Linux 虚拟显示 E2E、原生目录产物 smoke。
- `Checks (windows-2025)`：成功，包含静态/单元检查、Electron E2E、Windows 原生目录产物 smoke。
- `Checks (macos-26)`：成功，包含静态/单元检查、Electron E2E、macOS 原生目录产物 smoke。
- `Ubuntu Wayland smoke`：跳过，原因是专用自托管 GNOME Wayland runner 未配置；该 job 的跳过是预期状态，不影响已记录的本地 Ubuntu Wayland smoke，也不构成托管 runner 的真实 Wayland 证据。

## 未纳入本次关闭的范围

以下事项仍然开放，并转由 Gate 2 或后续发布门禁处理：

- Windows/macOS 真实交互式用户会话中的窗口召回、焦点恢复、权限和多显示器行为。
- 当前用户正常 Ubuntu GNOME Wayland 会话中的 GNOME Shell 扩展安装/启用、焦点恢复、Shell 重启、工作区和多显示器验证。
- Narrator、VoiceOver、Orca 及真实系统高对比度的人工体验复查。
- 原生全局快捷键、真实应用启动、第三方插件、SQLite 持久化、安装包签名和公开平台支持承诺。
- 通用持久写操作的幂等键、执行 ID 和独立状态查询；当前 Gate 1 方法和 Host Slice 的内存动作没有扩大到这一范围。

## 后续行动

Gate 2 继续保持 `validation-pending`。下一阶段优先取得当前 Ubuntu 正常 GNOME Wayland 会话的真实 Launcher/Previous App Focus 证据，再安排 Windows/macOS 真实会话和辅助技术复查；在 Gate 2 退出前不开发第三方插件系统。
