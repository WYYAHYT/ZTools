# Gate 1 实施进度记录

- Status: completed
- Recorded: 2026-08-27
- Accountable owner: zhangchonghao
- Verification owner: zhangchonghao

## 已完成并验证

- 正式 pnpm workspace、精确版本锁文件和依赖安装白名单已建立。
- CI 工作流不依赖全局 `pnpm` shim：setup-node 不提前启用 pnpm cache，所有安装与脚本均通过固定 `corepack pnpm@11.24.0` 执行；静态策略测试固定三平台 runner、Node/pnpm 版本和该失败边界。
- GitHub 官方公开 runner 清单已只读复核 `ubuntu-26.04=x64 preview`、`windows-2025=x64`、`macos-26=arm64`。三平台目录产物共享单一可测试矩阵，覆盖 3 个合法组合和 Linux/Windows/macOS 架构错配及未知平台拒绝；CI 在依赖安装前直接用固定 Node 校验实际平台/架构，验证失败不会先创建 staging/profile。工作流本身使用固定 `js-yaml 4.3.1` 结构化解析，锁定 job matrix、步骤顺序、Linux `xvfb` 条件、非 Linux 命令、只读权限和失败摘要上传策略，不只依赖字符串匹配。`checkout`、`setup-node`、`upload-artifact` 的官方 `v4` 引用已只读解析并固定到完整 40 位提交 SHA，策略测试拒绝任何浮动 `@vN` Action 引用。
- `Contract Kernel → Host RPC Contract → Bootstrap Application → Host Gateway → Electron Main/Bridge → Vue Host UI` 最小链路已贯通。
- Host Renderer 只暴露命名方法 `getBootstrap()`；业务包不导入 Electron，依赖方向由 dependency-cruiser 阻断。
- Gateway 对未知方法、未知字段、自报角色、超大消息、活动重复请求、完成后重放、deadline 和连接撤销执行默认拒绝或取消。
- Gateway 已增加旧连接 epoch、无效 request ID/协议版本、非法编码长度、tombstone 过期、速率/并发限制和应用输出 Schema 错误的自动化覆盖；错误信封不包含应用返回载荷。
- Electron IPC 使用有界 JSON 字符串信封，Main 在 JSON 解析前按 UTF-8 字节数拒绝超限输入；safe diagnostics 对敏感字段脱敏并限制字段长度。
- Gateway 已提供无载荷资源快照；4096 次连接建立/调用/撤销压力循环和连接提前撤销压力场景均验证活动请求、tombstone、速率窗口清理，并验证 epoch 历史保持 256 项上限。
- ADR-0012 的副作用确定性矩阵已在 Contract Kernel 穷举全部 600 个 effect/category/outcome/retryability 组合，并接入 Bootstrap、Search、Action 与 Window Visibility Gateway；写请求分派前拒绝固定为 `not-started`，Adapter 执行后无法确认固定为 `unknown + query-status-first`，非幂等写禁止直接退避重试。
- IPC JSON 在 Schema 校验前重建为无原型、冻结的新对象树，任何层级的 `__proto__`、`constructor`、`prototype` 均默认拒绝，同时执行最多 8 层、单数组 100 项和单字符串 8 KiB 的结构上限；诊断字段同样使用无原型映射并丢弃危险键。攻击夹具验证全局 `Object.prototype` 未变化，安全门禁验证移除任一控制都会失败。
- `contextIsolation`、`sandbox`、`webSecurity` 开启，`nodeIntegration` 关闭；正式 Ubuntu 26.04 GNOME Wayland smoke 中 Renderer 的 `process`、`require` 均为 `undefined`。
- 当前 Host 切片在 Chromium 启动层禁用后台联网并把所有主机解析为不可达，在 Electron Session 层拒绝 `http/https/ws/wss` 请求和运行时权限请求，Renderer CSP 使用 `connect-src 'none'`；安全门禁、单测和原生 Wayland smoke 复测通过，原型及本轮门禁曾捕获的外部 SSL 握手尝试均被启动前控制阻断。
- 正式 workspace 已接入固定 `@electron/packager 20.3.0` 的平台原生目录产物链路。Packager 只接收临时最小 staging：运行清单、生产 Main/preload 和 Renderer 文件；全树 allowlist 阻断源码、测试、workspace 链接和开发依赖进入 `app.asar`。三平台 CI 在各自 runner 构建并启动对应原生目录，使用隔离 `user-data-dir` 验证可信 Host ready、Renderer `process`/`require` 不可见和有界错误诊断。本机 Linux x64 已实际生成约 282 MiB 的 `ZTools-linux-x64`、验证非空原生可执行文件与约 540 KiB `app.asar`，并从该产物启动通过 smoke。成功与受控缺失产物失败路径均验证会生成单一结构化摘要；上传文件只含平台、阶段、退出状态、字节计数和隔离布尔值，不含命令行、环境、路径或原始进程输出，保留期 7 天。子进程正常/非零/spawn 失败/超时/终止拒绝均有所有权测试；超时时先请求终止并等待操作系统确认 `exit`，再删除隔离 profile，避免 Windows 文件锁或残留进程竞态。Windows/macOS 对应 runner 结果已由最新 CI 补齐。
- Host Renderer 的安全 WebPreferences 与默认拒绝网络策略已提取为可测试策略；Renderer 崩溃时先撤销旧连接，再在每窗口两次预算内只加载打包内固定 Host 文档，恢复失败或第三次崩溃时销毁窗口并以错误状态退出。当前仓库本地完整门禁通过：格式、全部 workspace 工程类型检查、lint、171 个常规源码测试、5 个独立压力/性能测试、架构检查、安全策略回退检测、Main/preload/Renderer 生产构建、包含 24 次 reload、30 次召回和 Renderer 崩溃清理/恢复预算的 2 项 Electron E2E、正式 Wayland smoke，以及平台原生目录产物构建/启动 smoke。Vitest 已显式排除 pnpm workspace symlink 下的重复测试路径。

正式 smoke 输出包含：

```text
event=ztools-gate1-smoke-ready
sessionType=wayland
waylandDisplay=wayland-0
Host UI=宿主已就绪 / Contract Gateway v1
Renderer process=undefined
Renderer require=undefined
```

## 证据边界与后续范围

- `.github/workflows/ci.yml` 已配置 `ubuntu-26.04`、`windows-2025`、`macos-26` 构建矩阵，并在每个平台执行源码构建、基础 E2E、平台原生目录产物构建与产物启动 smoke。GitHub Actions 运行 [33033812484](https://github.com/WYYAHYT/ZTools/actions/runs/33033812484) 于提交 `70ce0293d74d4cd32956aeec320126c9511c3722` 成功完成三个目标 runner 的对应 job。
- Windows x64 与 macOS arm64 的目标 runner 应用启动、Electron E2E、原生目录产物构建和 smoke 已取得 CI 证据；这仍是自动化 runner 证据，不等同于真实交互式设备或公开平台支持。
- Ubuntu 托管 runner 不默认等同真实 GNOME Wayland 用户会话；Wayland smoke job 默认关闭，且只匹配 `self-hosted/linux/x64/ztools-ubuntu-26.04-wayland` 的隔离桌面 runner，必须在明确配置并授权该外部 runner 后才可启用。
- 本地 Electron E2E 已覆盖 Host UI、Bridge 白名单、Renderer Node 隔离、主框架导航、弹窗拒绝、连续 24 次 reload 后连接撤销/新 epoch，以及 Renderer 崩溃后旧资源归零、两次固定本地文档恢复/新 epoch 和第三次崩溃有界退出；第二实例超时也复用统一子进程所有权策略，终止后等待 `exit` 再继续召回断言或 profile 清理，避免 Windows 文件锁污染后续步骤。仍需在 Windows/macOS CI 和真实目标平台取得对应证据。日志脱敏、传输超限、连接资源压力和故意回退 WebPreferences 已有自动测试。
- Electron 44 原生 Wayland 的固定 Vulkan 兼容输出已通过参数矩阵解释：`--disable-features=Vulkan` 与 `--use-angle=gl` 均不能消除，只有永久关闭全部 GPU 才能消除。正式 smoke 保留 Wayland 硬件加速，将精确单行转为 `expected-warning` 结构化诊断，并对其他 Electron `ERROR`、重复警告和 stderr 超限默认失败；不退回 X11，也不把日志过滤冒充问题消失。
- Wayland smoke 每次创建并清理唯一临时 Electron `user-data-dir`，不共享开发者 profile 或并发 E2E 状态。一次与 E2E 并行运行时严格诊断捕获到退出期 SSL 错误并阻断；改为独立 profile 后串行连续 3 次及最终 smoke 均无外部 SSL 错误。最终门禁仍按测试隔离原则串行执行 Electron E2E 与 Wayland smoke，不把并发多实例结果当作产品支持证据。

## 当前决定

Gate 1 已于 2026-08-27 根据 [Gate 1 关闭评审](GATE1-CLOSURE.md) 关闭。关闭范围是正式 workspace、工程边界、Contract Gateway、安全默认值、三平台 CI 和平台原生目录产物自动化验证；不包含真实桌面交互、签名/发布安装包、第三方插件或公开平台支持承诺。
