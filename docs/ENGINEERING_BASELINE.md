# 三平台工程验证基线

- Status: draft
- Baseline: 0.1
- Last updated: 2026-08-21
- Accountable owner: zhangchonghao
- Verification owner: zhangchonghao

本文件固定 Gate 1 所需的工程验证环境，不等同于最终公开支持政策。当前版本列出已知目标与待探测项；在创建正式 workspace、提交正式锁文件和安装正式产品依赖前，必须把候选项解析为精确版本并由获得委托的开发 agent 根据验证证据接受。若同时改变公开平台承诺、产生费用、使用外部账号/服务或扩大权限，仍必须由维护者决定。

为了验证候选本身，允许按本文流程在隔离、可丢弃的环境中安装依赖、运行最小构建和触发三平台 CI。验证原型不是正式工程骨架，不得直接合入 `vnext`。

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

## 从候选到正式基线

工程基线按以下顺序形成，避免“必须先验证才能接受、又必须先接受才能验证”的循环：

1. 调研当前受维护的 Node.js、pnpm、Electron、TypeScript、Vue、Schema validator、打包器和 CI runner。
2. 在本文件中记录精确版本候选、支持周期、CPU/OS 矩阵和已知风险；文档保持 `draft`。
3. 开发 agent 记录一次范围固定的可丢弃验证原型；执行涉及依赖下载、云 CI 或远程设备时，按维护者沟通规则取得对应外部操作权限。
4. 在隔离环境安装候选依赖，执行三平台最小构建、Ubuntu Wayland 启动和必要打包 smoke test。
5. 保存版本、命令、平台、结果和失败限制等证据；验证代码与生成物不直接合入正式 workspace。
6. 根据证据调整候选；通过后由维护者把本文件转为 `accepted`。
7. 只有此后才能在 `vnext` 创建正式 workspace、提交正式锁文件并安装正式产品依赖。

### 可丢弃验证原型规则

- 只能位于临时目录、临时 worktree 或名称明确的专用验证分支，不得在正式 `vnext` 工作树内生成产品骨架。
- 验证分支可以为了托管 CI 暂存最小 scaffold 和锁文件，但不得合并这些产品文件；只允许把验证报告、版本依据和 CI 证据整理回正式文档。
- 原型只验证技术栈、工具版本、最小启动、打包和平台可行性，不得提前实现 Domain、Application、Contract Gateway 或产品功能。
- 原型不继承旧 ZTools 工程配置，不以关闭安全选项换取通过。
- 依赖下载、云 CI、远程 Mac 或其他外部资源仍需要正常授权；本流程不扩大操作权限。
- 验证失败时丢弃原型并更新候选，不得因为已经投入工作而降低接受条件。
- 原型目录、分支、验证命令、候选版本、CI 运行和清理结果必须记录，避免不可复现的口头结论。

该流程属于 `DESIGN_PROCESS.md` 已允许的“批准前、隔离且可丢弃的技术验证”，不构成产品架构已实施。

## 正式工具链固定规则

正式工程骨架创建前记录、验证、接受并提交：

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

## 工程基线接受条件

- ADR-0009 已接受。
- 精确版本候选、支持周期、CPU/OS 矩阵和验证范围已经过技术审阅。
- 可丢弃验证原型已获维护者明确授权，且原型位置与清理规则有记录。
- CI 提供商与当前可用固定 runner 标签已核验并记录。
- Node/pnpm/Electron/TypeScript 精确版本已通过最小三平台构建原型。
- Ubuntu 26.04 GNOME Wayland 本机启动证据已保存。
- Windows 与 macOS 缺少真实设备的范围已明确标记为托管 CI/VM 证据，不宣传正式支持。
- 验证原型没有作为正式产品 scaffold 合入 `vnext`，临时资源已清理或明确保留期限。
- 有权决定的技术负责人接受本文件并在 OPEN_ITEMS 中把对应事项更新为 `accepted`；若包含产品、费用、外部服务或权限变化，另附维护者审批记录。

## 接受与验证状态

- `draft`：版本和矩阵仍在调研，或验证证据尚未完成。
- `accepted`：精确版本、runner、矩阵及验证证据已获批准，允许创建正式工程骨架。
- `implemented`：正式 workspace、锁文件和 CI 已按该基线落地，并通过对应检查。

三种状态不能互相替代；可丢弃原型通过只提供接受证据，不表示正式工程已经实现。
