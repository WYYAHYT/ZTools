# 三平台工程验证基线

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-26
- Accountable owner: zhangchonghao
- Verification owner: zhangchonghao
- Accepted: 2026-08-26
- Decider: development agent under delegated technical authority
- Approval record: [Gate 1 toolchain validation](reviews/GATE1-TOOLCHAIN-VALIDATION.md)

本文件固定 Gate 1 所需的工程验证环境，不等同于最终公开支持政策。当前版本已经固定正式 workspace 的精确工具版本和平台证据分层，允许创建正式 workspace、提交正式锁文件和安装正式产品依赖。Windows/macOS 目标平台启动与 E2E 仍为 Gate 1 退出阻断项；它们没有被 Ubuntu 本机或 Linux 上的交叉打包替代。

为了验证候选本身，允许按本文流程在隔离、可丢弃的环境中安装依赖、运行最小构建和触发三平台 CI。验证原型不是正式工程骨架，不得直接合入 `vnext`。

## 产品目标与工程验证的区别

- 产品目标：Windows、macOS、Ubuntu 26.04 GNOME Wayland 都是一等平台。
- 工程验证基线：Gate 1 实际在哪些 OS 镜像、CPU 和桌面会话上编译、启动和测试。
- 公开支持政策：Preview 前根据真实设备、签名、安装和维护能力另行确定。

CI 通过只能证明对应 runner 范围；托管 runner 不能替代真实 Windows/macOS/GNOME Wayland 用户会话。

## Gate 1 平台矩阵

| 平台 | CPU | 本地/真实环境 | 托管 CI 基线 | Gate 1 证据 |
| --- | --- | --- | --- | --- |
| Ubuntu | x86_64 | Ubuntu 26.04、默认 GNOME、原生 Wayland | `ubuntu-26.04` x64；当前为 GitHub Actions preview，若稳定性不足并列 `ubuntu-24.04` 构建证据 | 类型/测试/构建 + 26.04 Wayland 启动和窗口 smoke test |
| Windows | x86_64 | Windows 11 交互式 VM；Preview 前真实设备 | `windows-2025` x64 | 类型/测试/构建/基础 Electron E2E；里程碑补真实会话 |
| macOS | arm64 优先 | Apple Silicon macOS 真实或合规远程 Mac | `macos-26` arm64 | 类型/测试/构建/基础 Electron E2E；里程碑补权限、签名和真实会话 |

Runner 标签固定到明确 OS 版本，不使用 `*-latest`。2026-08-26 已通过 GitHub 官方 runner-images 清单和托管 runner 文档只读复核：`ubuntu-26.04` 为 x64 preview、`windows-2025` 为 x64、`macos-26` 为 arm64。CI 在依赖安装和临时资源分配前执行同一平台矩阵校验，标签或架构漂移会立即失败。托管镜像内部软件会按周更新，所以锁文件、Node 精确版本和构建工具仍由仓库固定；镜像更新造成的差异必须由 CI 产物记录。工作流第三方 Actions 使用只读核验的完整提交 SHA，不使用可移动主版本标签。

## 正式工具链

以下版本在 2026-08-26 的隔离原型中完成依赖解析、严格类型检查、生产 Renderer 构建和 Ubuntu 原生 Wayland 启动验证：

| 工具 | 精确版本 | 用途与约束 |
| --- | --- | --- |
| Node.js | `24.18.0` | 开发与 CI；Node 24 Krypton LTS，计划维护至 2028-04-30 |
| pnpm | `11.24.0` | workspace 和锁文件；由 `packageManager` 与 Corepack 固定 |
| Electron | `44.0.0` | Gate 1 唯一支持版本；内含 Chromium `152.0.7977.54`、Node `24.18.1` |
| Vue | `3.5.41` | Host Renderer UI |
| TypeScript | `5.9.3` | 所有正式 TypeScript 包启用 strict 模式；与 ESLint 类型检查生态兼容。Electron 外部声明使用 `skipLibCheck`，业务源码仍严格检查 |
| Vite | `8.2.2` | Host Renderer 生产构建 |
| `@vitejs/plugin-vue` | `6.0.8` | 该版本明确声明兼容 Vite 8；旧 `6.0.1` 已在原型中因 peer 范围被否决 |
| Vitest | `4.1.11` | Domain、Application、Contract、组件和架构测试运行器 |
| Playwright | `1.62.1` | Electron E2E；目标平台运行证据仍待正式 workspace CI |
| Ajv | `8.20.0` | JSON Schema 运行时校验候选的固定实现 |
| `@sinclair/typebox` | `0.34.52` | JSON Schema 兼容的类型构造器；不进入公开协议格式 |
| ESLint | `9.39.5` | 静态规则与禁止导入；ESLint 10 超出当前 TypeScript/Vue lint 插件兼容范围，已在工具链验证中否决 |
| Prettier | `3.9.6` | 格式检查 |
| dependency-cruiser | `18.2.0` | 包依赖方向、环和跨边界导入检查 |
| `@electron/packager` | `20.3.0` | Gate 1 目录产物 smoke test；发布安装包工具在对应 Gate 再固定 |
| esbuild | `0.28.2` | 将 Main 与 preload 分别打包为 ESM/CJS；只负责产物组装，不替代业务包类型检查 |

正式依赖全部使用精确版本，不使用 `^`、`~` 或 `latest`。自动更新只能提出变更，不能静默改写 Electron 主版本、Node 基线或 runner 标签。

## Workspace 准入证据与 Gate 1 退出证据

为避免暂缺 Windows/macOS 真机阻塞 Ubuntu 上的主体开发，本基线区分两类证据，但不降低三平台目标：

### Workspace 准入（已满足）

- 精确工具版本和 runner 标签已固定。
- `pnpm install --frozen-lockfile`、类型检查、测试和构建门禁通过；`pnpm peers check` 在 pnpm `11.24.0` 对当前含空 importer 的 workspace 会触发自身的 `undefined.devDependencies` 异常，因此不作为 CI 门禁，不能把该命令异常解释为项目 peer 冲突。
- TypeScript Main 构建和 Vite Renderer 生产构建通过。
- Electron 44 开发实例及 Linux x64 目录产物均在 Ubuntu 26.04 GNOME 原生 Wayland 会话启动。
- `contextIsolation=true`、`sandbox=true`、`webSecurity=true`、`nodeIntegration=false`；Renderer 运行时 `process` 与 `require` 均为 `undefined`。
- Linux 上的 Windows x64 与 macOS arm64 目录产物解析成功，但仅作为资源/打包输入证据。
- 正式 workspace 现在使用最小 staging 和固定 `@electron/packager 20.3.0` 生成平台原生目录产物；Linux x64 产物已在本机生成并直接启动，确认可信 Host ready、Renderer Node 隔离和有界错误诊断。CI 已配置在各目标 runner 执行同一构建与 smoke；失败时只上传不含原始输出、路径、命令行或环境的结构化摘要并保留 7 天。实际 Windows/macOS 结果仍属于 Gate 1 退出证据。

### Gate 1 退出（尚未满足）

- 正式 workspace 在 `ubuntu-26.04`、`windows-2025` 和 `macos-26` 执行类型、单元、契约、组件和构建矩阵。
- Windows x64 与 macOS arm64 在目标 runner 启动正式应用并执行基础 Electron E2E。
- Ubuntu 26.04 原生 Wayland 对正式应用执行窗口 smoke test，而不是复用临时原型结果。
- GitHub 托管 Ubuntu runner 不冒充 GNOME Wayland 用户会话；可选 Wayland job 默认关闭，并只匹配同时具有 `self-hosted/linux/x64/ztools-ubuntu-26.04-wayland` 标签的隔离桌面 runner。配置或启用该外部 runner 仍需单独授权和真实环境证据。
- 三个平台产物均由对应平台生成；Linux 交叉生成的 macOS 产物缺少 codesign 后的 asar integrity 恢复，不能作为 macOS 发布或安全证据。
- Electron 44 的精确 Wayland/Vulkan 兼容警告在正式 smoke 中转为有单元测试覆盖的 `expected-warning` 结构化诊断；参数矩阵证明只有 `--disable-gpu` 能消除该初始化输出，因此保留 Wayland 硬件加速，不退回 X11，也不为消除无故障警告永久关闭全部 GPU。Smoke 对其他 Electron `ERROR`、重复已知警告和超过 64 KiB 的 stderr 默认失败，并为每次运行创建、清理唯一临时 `user-data-dir`，不读取开发者 profile。退出阶段外部 SSL 尝试已通过正式 Host 的 Chromium 后台联网禁用、启动前主机解析拒绝、Session 远程请求默认拒绝、权限请求默认拒绝、CSP、自动测试和隔离原生 Wayland smoke 复测关闭；未来网络能力不得静默移除此策略，必须先完成网络 ADR 与受控 Port。

缺少 Gate 1 退出证据时可以继续实现平台无关核心和 Ubuntu 主路径，但不能关闭 Gate 1、把对应平台标为 `implemented`，或宣传正式平台支持。

## 初始架构范围

- Ubuntu x86_64：Gate 1 必测。
- Windows x86_64：Gate 1 必测。
- macOS arm64：Gate 1 目标与首个 Preview 的主要 macOS 架构。
- Windows ARM64、Ubuntu ARM64：当前不在 Gate 1 矩阵，不能从源码可编译推断支持。
- macOS Intel：是否构建、测试或标记 Community 必须在选定 Electron 与 CI 资源后由维护者决定。

这些是 Gate 1 工程范围，不是最终最低系统版本承诺。

## 从候选到正式基线

工程基线按以下顺序形成，避免“必须先验证才能接受、又必须先接受才能验证”的循环：

1. 调研当前受维护的 Node.js、pnpm、Electron、TypeScript、Vue、Schema validator、打包器和 CI runner。
2. 在本文件中记录精确版本候选、支持周期、CPU/OS 矩阵和已知风险；文档保持 `draft`。
3. 开发 agent 记录一次范围固定的可丢弃验证原型；执行涉及依赖下载、云 CI 或远程设备时，按维护者沟通规则取得对应外部操作权限。
4. 在隔离环境安装候选依赖，执行三平台最小构建、Ubuntu Wayland 启动和必要打包 smoke test。
5. 保存版本、命令、平台、结果和失败限制等证据；验证代码与生成物不直接合入正式 workspace。
6. 根据证据调整候选；通过后由有权决定的技术负责人把本文件转为 `accepted`。若改变产品方向、费用、外部服务、权限或产生不可逆影响，另行取得维护者决定。
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

后续版本只能在升级时根据官方维护状态和依赖兼容性选择，本基线不虚构未来版本号。

## 工程基线接受条件

- ADR-0009 已接受。
- 精确版本候选、支持周期、CPU/OS 矩阵和验证范围已经过技术审阅。
- 可丢弃验证原型已获维护者明确授权，且原型位置与清理规则有记录。
- CI 提供商与当前可用固定 runner 标签已核验并记录。
- Node/pnpm/Electron/TypeScript 精确版本已通过 Ubuntu 本机构建与启动原型；Windows/macOS 目录产物已解析，目标平台构建和启动明确保留为 Gate 1 退出证据。
- Ubuntu 26.04 GNOME Wayland 本机启动证据已保存。
- Windows 与 macOS 缺少真实设备的范围已明确标记为托管 CI/VM 证据，不宣传正式支持。
- 验证原型没有作为正式产品 scaffold 合入 `vnext`，临时资源已清理或明确保留期限。
- 有权决定的技术负责人接受本文件并在 OPEN_ITEMS 中把对应事项更新为 `accepted`；若包含产品、费用、外部服务或权限变化，另附维护者审批记录。

## 接受与验证状态

- `draft`：版本和矩阵仍在调研，或验证证据尚未完成。
- `accepted`：精确版本、runner、矩阵及验证证据已获批准，允许创建正式工程骨架。
- `implemented`：正式 workspace、锁文件和 CI 已按该基线落地，并通过对应检查。

三种状态不能互相替代；可丢弃原型通过只提供接受证据，不表示正式工程已经实现。
