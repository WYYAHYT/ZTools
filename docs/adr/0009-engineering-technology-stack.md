# ADR-0009：工程技术栈

- Status: implemented
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit `3a5ad77`
- Reviewers: independent Agent review incorporated; zhangchonghao
- Verification owner: zhangchonghao
- Review by: before Gate 1 implementation
- Supersedes: none
- Superseded by: none
- Related: [ARCHITECTURE](../ARCHITECTURE.md), [TESTING](../TESTING.md), [ENGINEERING_BASELINE](../ENGINEERING_BASELINE.md)

## 背景

ADR-0001 决定从零建设模块化单体，但其基线冻结前的早期候选稿同时写入 Electron、Vue 3、TypeScript 和 pnpm workspace，没有单独比较技术方案、Wayland 风险、原生依赖打包和退出策略。该候选表述已经在 Baseline 0.1 评审中移出 ADR-0001，不构成对已冻结 ADR 的取代。Gate 1 将直接依赖这些选择，因此需要独立决策。

本 ADR 只决定应用壳、Host UI、主要语言和 workspace 工具，不允许这些技术进入 Domain/Application 核心，也不决定数据库驱动、Schema 库、打包器或自动更新服务。

## 决策驱动因素

- Windows、macOS、Ubuntu 26.04 GNOME Wayland 的桌面与分发能力。
- Host UI 和插件 UI 的开发效率、可访问性与隔离能力。
- 类型、Schema、RPC 和 pnpm workspace 的工程一致性。
- Electron 安全默认值与多进程能力能够被自动验证。
- 项目已有 Web/TypeScript 经验，同时不继承旧项目耦合。
- 原生平台能力可通过窄 Adapter/Helper 补充。
- 有明确升级窗口、故障隔离和退出策略。

## 考虑的方案

### 方案 A：Electron + Vue 3 + TypeScript + pnpm workspace

优点：

- 三个平台具有成熟桌面壳、Chromium UI、Renderer 隔离和自动化测试路径。
- TypeScript 可覆盖 Host UI、应用外层、契约和工具链。
- Vue 3 适合构建键盘优先的 Host UI，团队已有方向共识。
- pnpm workspace 能表达模块边界并减少多包管理成本。

代价：

- Electron 体积、内存和更新成本较高。
- Wayland、窗口焦点、全局快捷键和系统权限仍需要平台 Adapter，Electron 本身不能解决。
- 原生依赖需要 Electron ABI、签名和三平台打包验证。
- 错误使用 preload、IPC 或 WebPreferences 会造成严重安全回退。

### 方案 B：Tauri/WebView + Vue 3 + TypeScript + Rust

优点是应用体积可能更小、原生桥接边界更显式；缺点是引入 Rust 与各平台 WebView 差异，插件 Worker、统一 Chromium 行为、调试和复杂桌面能力仍需大量定制。它不能自动解决 GNOME Wayland 限制。

### 方案 C：Windows/macOS/Linux 分别使用原生 UI

可获得最直接的平台行为和性能，但会形成三套 UI、交付和测试体系，不适合当前团队规模，也难以提供统一插件 UI。

### 方案 D：继续沿用旧项目的 Electron 工程结构

可以复用配置，但会重新引入本项目明确拒绝的 preload、IPC、全局管理器与安全包袱，不满足从零边界。

## 决策

选择方案 A，并附加以下约束：

- Electron 与 Vue 只存在于 Delivery/Adapter 外层。
- Gate 1 先验证原生 Wayland、Windows 和 macOS 的最小启动、窗口与打包，不以跨平台编译成功替代真实桌面证据。
- Electron 主版本、Node ABI、构建器和签名工具在 [ENGINEERING_BASELINE.md](../ENGINEERING_BASELINE.md) 中单独固定，经三平台 smoke test 后才能升级。
- WebPreferences 安全不变量、业务代码禁用裸 IPC 和包依赖方向必须由 CI 阻断。
- 不为 Electron 方便而改变 Domain、Application Port 或插件公开契约。

该决策允许进入 Gate 1 的工程准备。`ENGINEERING_BASELINE.md` 被接受前，只允许在临时目录、临时 worktree 或专用验证分支运行范围已记录的可丢弃原型；安装候选依赖、使用云 CI 或远程设备前必须取得对应外部操作权限。创建正式 workspace、提交正式锁文件或安装正式产品依赖前，必须先接受其中的精确版本和平台矩阵。

## 后果

### 正面

- 可以用一套 Host UI 和主要语言快速验证纵向切片。
- Electron 的 Renderer/UtilityProcess 能承载明确隔离边界。
- 三平台托管 CI 和 Playwright Electron E2E 有可行路径。

### 代价与风险

- 必须持续跟踪 Electron/Chromium 安全更新和 Wayland 回归。
- 原生 Helper、GNOME Shell 扩展和系统签名仍需平台专门知识。
- 若性能或平台证据不满足退出条件，需要保留替换 Delivery 壳的能力。

## 安全、隐私与权限影响

- Electron Main 和 Host Renderer 属于可信区域，但仍使用最小 Bridge。
- Plugin Renderer 必须执行 ADR-0003 的 sandbox、context isolation 与 web security 不变量。
- 远程内容不能进入 Host UI 信任上下文。
- Electron 更新和依赖供应链进入发布威胁模型。

## 平台影响

- Ubuntu：必须在 Ubuntu 26.04 原生 GNOME Wayland 实机验证，不把 XWayland 成功当作目标路径证据。
- Windows：验证窗口、托盘、安装包、原生依赖与签名链。
- macOS：验证 Apple Silicon、激活策略、权限、签名与公证；Intel 是否构建由支持基线另行决定。

## 迁移与回滚

当前没有 vNext 代码。Gate 1 原型若失败，可以在不迁移 Domain/Application 的情况下替换 Delivery 技术。开始公开插件 UI 协议后，替换成本会升高，因此 Gate 1 必须保存证据。

## 验证方式

- 三平台编译、启动和最小打包 smoke test。
- Ubuntu 26.04 GNOME Wayland 实机窗口测试。
- Electron 安全配置、依赖边界和裸 IPC 禁止规则在 CI 中故意回退时失败。
- 记录内存、冷启动、窗口召回和包体积基线，但不在原型前虚构阈值。

## 实施记录

正式 Electron/Vue/TypeScript/pnpm workspace、精确版本、依赖边界和安全门禁已经落地。提交 `70ce029` 的三平台 CI 在 Ubuntu x64、Windows x64 和 macOS arm64 对正式应用完成构建、基础 Electron E2E 和对应平台原生目录产物 smoke；Ubuntu 正式应用另有原生 GNOME Wayland smoke。Gate 1 关闭证据见 [Gate 1 关闭评审](../reviews/GATE1-CLOSURE.md)。该实施状态不包含签名、安装包、真实设备交互或公开支持承诺。
