# 路线图

- Status: accepted
- Baseline: 0.1
- Last updated: 2026-08-21

路线图按退出条件而不是日期组织。每个阶段只在验证其关键假设后进入下一阶段；不为了填充框架同时铺开所有模块。

本路线图已经接受。各阶段依赖的设计、负责人和阻断关系统一登记在 [OPEN_ITEMS.md](OPEN_ITEMS.md)；后续 Gate 转换仍需维护者在评审记录中明确授权。

## Gate 0：Design Baseline 0.1

目标：形成可用于开始工程设计的共同边界。

退出条件：

- 原则、愿景、产品范围、架构、安全、插件和平台文档完成一致性评审。
- 首批 accepted ADR 已获得维护者确认。
- [ADR-0006](adr/0006-legacy-plugin-compatibility.md)、[ADR-0007](adr/0007-gnome-wayland-integration.md) 和 [ADR-0008](adr/0008-storage-strategy.md) 已接受，并已同步到当前设计文档。
- 文档状态、设计变更和 ADR 取代流程可执行。
- [Baseline 0.1 评审记录](reviews/BASELINE-0.1.md) 的 Gate 0 清单完成。
- `PRODUCT.md`、本路线图、修订后的 `ARCHITECTURE.md` 与 `PLATFORM_CAPABILITIES.md` 由维护者明确转为 `accepted`。
- 创建首个基线提交；是否同时创建 `design-baseline-0.1` 标签由维护者决定。
- 维护者在评审记录中明确写入“允许开始 Gate 1”。

Gate 0 已于 2026-08-21 经维护者评审关闭。基线提交及 Gate 1 授权见 [Baseline 0.1 评审记录](reviews/BASELINE-0.1.md)。

## Gate 1：工程基础与可执行边界

目标：建立最小工程骨架，用自动化证明依赖方向和安全默认值。

预期工作：

- 建立 Electron、Vue 3、TypeScript、pnpm workspace 的最小应用。
- 划分 Domain、Application、Contracts、Adapters 与 Delivery 包。
- 建立类型检查、格式、单元测试、包依赖检查和 CI。
- 实现最小 Contract Gateway，只包含身份、Schema、超时、取消和默认拒绝测试。
- 创建隔离测试数据目录和 Electron 端到端测试夹具。
- 按 [TESTING.md](TESTING.md) 建立 Ubuntu、Windows、macOS CI 矩阵及分层发布门禁。

退出条件：应用能显示可信空壳 UI；架构违规、安全配置回退和未知 RPC 会使 CI 失败。

开始 Gate 1 实现前必须：

- 接受工程技术栈 ADR-0009。
- 接受 Contract、身份绑定与协议所有权 ADR-0010。
- 接受 Capability 多维状态 ADR-0011。
- 接受 `ERROR_MODEL.md`，统一取消、超时、幂等和未知副作用结果。
- 接受 [ENGINEERING_BASELINE.md](ENGINEERING_BASELINE.md)，包括操作系统、CPU、CI runner 镜像与 Electron 兼容窗口。
- 确认 [ARCHITECTURE.md](ARCHITECTURE.md) 中的包级依赖矩阵和禁止导入规则足以自动执行。

测试策略已经记录于 [TESTING.md](TESTING.md)。上述事项以 [OPEN_ITEMS.md](OPEN_ITEMS.md) 为准，任一阻断项未完成都不能开始对应工程实现。

## Gate 2：首个宿主纵向切片

目标：验证主窗口召回、查询会话、宿主命令结果和动作执行的完整链路，不引入第三方插件。

预期工作：

- 主窗口显示/隐藏和平台 Capability 状态。
- 可取消的增量搜索会话与一组宿主命令。
- Windows、macOS、GNOME Wayland 的最小 Launcher Adapter。
- 焦点恢复成功、受限和失败的明确反馈。
- 性能基线、结构化诊断和真实平台 E2E。

开始前输入：

- [首个宿主纵向切片验收规格](specs/HOST_VERTICAL_SLICE.md)已经接受。
- [旧项目只读行为审计](audits/LEGACY_BEHAVIOR.md)已覆盖用户可见行为、失败案例、迁移样本、可复用纯算法和明确放弃项。

退出条件：三个目标平台满足已接受的纵向切片验收规格；能力缺失不会崩溃或阻塞搜索，性能、取消、失败和可访问性都有可复查证据。

## Gate 3：Secure Plugin 最小纵向切片

目标：运行一个最小第三方插件，从 Manifest 到搜索结果、动作和沙箱 UI 全链路验证安全模型。

预期工作：

- Manifest Schema、插件身份和安装事务。
- Plugin Worker 与 Plugin UI 独立生命周期。
- 最小 Bridge/RPC API、配额、超时和隔离。
- 插件私有存储与一个低风险 Capability。
- 安装、禁用、升级失败和卸载清理 E2E。

退出条件：恶意/错误插件夹具无法访问 Node、Electron、裸 IPC、其他插件数据或未授权 API，并且不会拖垮宿主。

在开始前补充并接受：`PERMISSION_UX.md`、`DATA_OWNERSHIP.md`、`COMPATIBILITY.md`、插件生命周期状态机，以及 [THREAT_MODEL.md](THREAT_MODEL.md) 中覆盖插件安装、升级、运行、卸载的数据流与控制证据。

## Gate 4：平台能力与权限切片

目标：逐项建设用户价值最高的平台能力，并验证各平台真实授权和降级体验。

候选顺序：应用发现/启动、文件选择/打开、剪贴板、通知、屏幕捕获；顺序由用户价值和风险重新评审。

每项能力必须同时交付：

- 稳定 Capability Contract 和三个目标平台 Adapter/明确降级。
- 插件声明、用户授权、撤销和审计。
- 拒绝、取消、超时、依赖缺失和资源清理测试。
- 对应用户文案与平台支持说明。

## Gate 5：可用产品闭环

目标：达到可供早期用户持续使用和插件作者开发的 Preview。

预期工作：

- 插件管理、来源、完整性和升级恢复。
- 设置、权限中心、诊断和可访问性。
- 搜索排序、缓存、性能与资源配额调优。
- Ubuntu `.deb` 主发布链路和 AppImage 辅助验证。
- Windows、macOS 安装与签名路径。
- 用户数据迁移、隐私、可观察性和支持政策。

进入发布前补充：`MIGRATIONS.md`、`PRIVACY.md`、`OBSERVABILITY.md`、`PLUGIN_DISTRIBUTION.md`、`RELEASE_PROCESS.md`、`SUPPORT_POLICY.md` 和 `CONTRIBUTING.md`。

## Gate 6：稳定生态

目标：稳定插件协议、发布门禁和支持承诺，并以真实需求决定后续能力。

可能方向包括市场、旧插件迁移工具、更多 Linux 桌面、同步与账号能力。它们都不是默认承诺，必须分别经过产品和架构决策。

## 路线图规则

- 同步不是首阶段功能。
- KDE 和其他 Linux 桌面不是首阶段发布门禁。
- 旧插件兼容不能阻塞 Secure Runtime 的正确边界。
- 任何阶段都不得用关闭安全配置、扩大默认权限或隐藏降级来满足退出条件。
- 阶段结束时只把经过测试的范围标为 `implemented`。
- Gate 转换必须由维护者在评审记录中明确批准，不能由提交存在、CI 通过或路线图措辞自动推断。
