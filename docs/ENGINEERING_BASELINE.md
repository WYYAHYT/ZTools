# 三平台工程验证基线

- Status: draft
- Baseline: 0.1
- Last updated: 2026-08-21

本文件固定 Gate 1 所需的工程验证环境，不等同于最终公开支持政策。当前版本列出已知目标与待探测项；在创建 CI workflow 和安装 Electron 前，必须把候选项解析为精确版本并由维护者接受。

## 产品目标与工程验证的区别

- 产品目标：Windows、macOS、Ubuntu 26.04 GNOME Wayland 都是一等平台。
- 工程验证基线：Gate 1 实际在哪些 OS 镜像、CPU 和桌面会话上编译、启动和测试。
- 公开支持政策：Preview 前根据真实设备、签名、安装和维护能力另行确定。

CI 通过只能证明对应 runner 范围；托管 runner 不能替代真实 Windows/macOS/GNOME Wayland 用户会话。

## Gate 1 候选矩阵

| 平台 | CPU | 本地/真实环境 | 托管 CI 候选 | Gate 1 证据 |
| --- | --- | --- | --- | --- |
| Ubuntu | x86_64 | Ubuntu 26.04、默认 GNOME、原生 Wayland | 实现前选择并固定可用的 Ubuntu x64 runner 镜像；若无 26.04 托管镜像，CI 编译与本机 26.04 实机证据并列 | 类型/测试/构建 + 26.04 Wayland 启动和窗口 smoke test |
| Windows | x86_64 | Windows 11 交互式 VM；Preview 前真实设备 | 实现前从 CI 提供商当前受支持的 Windows x64 固定镜像中选择，禁止长期使用浮动 `*-latest` 作为基线 | 类型/测试/构建/基础 Electron E2E；里程碑补真实会话 |
| macOS | arm64 优先 | Apple Silicon macOS 真实或合规远程 Mac | 实现前选择提供 arm64 的固定 macOS 镜像；若托管 CI 只能覆盖另一架构，必须明确双轨证据 | 类型/测试/构建/基础 Electron E2E；里程碑补权限、签名和真实会话 |

## 初始架构范围

- Ubuntu x86_64：Gate 1 必测。
- Windows x86_64：Gate 1 必测。
- macOS arm64：Gate 1 目标与首个 Preview 的主要 macOS 架构。
- Windows ARM64、Ubuntu ARM64：当前不在 Gate 1 矩阵，不能从源码可编译推断支持。
- macOS Intel：是否构建、测试或标记 Community 必须在选定 Electron 与 CI 资源后由维护者决定。

这些是工程范围候选，不是最终最低系统版本承诺。

## 工具链固定规则

Gate 1 开始前记录并提交：

- Node.js 精确版本及其生命周期依据。
- pnpm 精确版本和 `packageManager`/Corepack 策略。
- Electron 精确版本、Chromium/Node 版本及安全支持状态。
- TypeScript、Vue、测试框架、Schema validator 与打包器版本。
- 三平台 runner 的精确镜像标签和 CPU 架构。
- `.deb`、Windows 安装包和 macOS 应用包的构建工具；签名可在 PR 中禁用，但发布验证路径必须可分离。

锁文件固定依赖解析；自动依赖更新不能越过 Electron 主版本或平台基线而不触发评审。

## Electron 兼容窗口

- Gate 1 只支持仓库固定的一个 Electron 版本，不承诺应用代码同时兼容多个主版本。
- Electron 升级必须通过三平台编译、启动、E2E、安全 WebPreferences、原生依赖 ABI 和打包 smoke test。
- Electron 主版本升级若改变 Renderer 隔离、Wayland 行为、进程模型或公开插件环境，按 Level 2 评审。
- 使用维护中的 Electron 版本；版本进入停止安全维护窗口前必须升级或停止发布。

具体版本只能在执行时根据官方维护状态和依赖兼容性选择，本候选文档不虚构未来版本号。

## Gate 1 接受条件

- ADR-0009 已接受。
- CI 提供商与当前可用固定 runner 标签已核验并记录。
- Node/pnpm/Electron/TypeScript 精确版本已通过最小三平台构建原型。
- Ubuntu 26.04 GNOME Wayland 本机启动证据已保存。
- Windows 与 macOS 缺少真实设备的范围已明确标记为托管 CI/VM 证据，不宣传正式支持。
- 维护者接受本文件并在 OPEN_ITEMS 中把对应事项更新为 `accepted`。
