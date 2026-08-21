# ADR-0008：本地持久化与密钥存储策略

- Status: accepted
- Proposed: 2026-08-21
- Accepted: 2026-08-21
- Deciders: zhangchonghao
- Approval record: [Baseline 0.1 review](../reviews/BASELINE-0.1.md), baseline commit pending
- Reviewers: baseline design discussion; independent Agent review incorporated
- Verification owner: unassigned
- Review by: before first persistent vertical slice
- Supersedes: none
- Superseded by: none
- Related: [ARCHITECTURE](../ARCHITECTURE.md), [PLUGIN_MODEL](../PLUGIN_MODEL.md)

## 背景

宿主需要保存设置、插件身份、权限、索引元数据和诊断状态；插件需要隔离的结构化存储、附件和机密。直接让插件接触数据库或文件路径会破坏数据所有权、迁移和权限边界。

同步不是首阶段需求，但首次发布的数据格式需要支持事务、迁移、备份边界和未来演进。

## 决策驱动因素

- 事务与崩溃恢复。
- 每插件隔离、配额和可删除性。
- 大附件与结构化记录的不同访问模式。
- 密钥不能进入普通数据库、日志或备份。
- Windows、macOS 与 Ubuntu 有稳定实现路径。

## 考虑的方案

### 方案 A：SQLite + 插件逻辑命名空间 + 附件目录 + 系统密钥库

宿主通过 Repository/Storage Port 独占数据库访问；插件使用受控 API。结构化元数据进入 SQLite，大对象进入宿主管理的附件目录，机密进入 Credential Manager、Keychain 或 Secret Service。

### 方案 B：每插件独立数据库和目录

物理隔离与导出较直观，但连接、迁移、备份和大量小数据库管理成本更高；宿主跨插件元数据仍需独立存储。

### 方案 C：键值文件或嵌入式 KV 作为统一后端

简单读写容易，但复杂迁移、事务、查询和一致性能力可能不足；大对象与密钥仍需额外方案。

## 决策

选择方案 A：SQLite + 插件逻辑命名空间 + 附件目录 + 系统密钥库。

在固化数据库驱动、物理表结构和附件提交协议前，必须完成一个窄原型并验证：

- Electron 主进程/UtilityProcess 中数据库驱动的打包与故障行为。
- 事务迁移、损坏检测和备份恢复。
- 插件命名空间无法越权访问。
- 附件原子写入、垃圾回收和配额。
- 三个平台系统密钥库在无桌面会话、锁定或拒绝时的错误语义。

这里的“插件逻辑命名空间”不要求所有插件共享数据表；物理表设计应由查询、迁移和隔离测试决定，不进入插件公开契约。

原型可以否定具体驱动、表布局或进程位置，但不能绕过 Storage Port、插件命名空间、附件所有权和系统密钥库边界；若证据要求改变这些已接受边界，应创建新 ADR。

## 后果

### 正面

- 宿主元数据具备成熟事务与查询能力。
- 插件只看到稳定存储 API，后端和 Schema 可迁移。
- 大对象与密钥使用适合其风险和访问模式的后端。

### 代价与风险

- 需要协调数据库事务和附件文件提交，处理部分失败。
- 逻辑隔离必须由所有查询路径执行，需自动化越权测试。
- 系统密钥库可能弹窗、锁定或不可用，调用必须异步并可恢复。
- 原生数据库依赖会增加 Electron ABI、打包和更新测试成本。

## 安全、隐私与权限影响

- 插件永远不获得数据库连接、数据库路径、附件真实路径或密钥明文导出接口。
- 所有存储调用绑定插件身份并执行命名空间与配额。
- 权限记录、插件包和用户内容应有明确备份与删除策略。
- 数据库不记录访问令牌、密码和其他应进入系统密钥库的值。

## 平台影响

- Windows 使用 Credential Manager 候选 Adapter。
- macOS 使用 Keychain 候选 Adapter。
- Ubuntu GNOME 使用 Secret Service 候选 Adapter；服务缺失或密钥环锁定必须显式报告。
- SQLite 与附件语义跨平台一致，路径和锁定细节封装在 Adapter。

## 迁移与回滚

从第一版 Schema 开始使用单调版本迁移、迁移前备份和失败回滚。附件采用临时写入、校验、原子替换与可重建索引。旧 ZTools 数据只能通过版本化导入器进入新领域模型，不直接复制内部数据库。

## 验证方式

- 原型基准、崩溃注入和数据库损坏恢复测试。
- 多插件越权、配额、卸载清理与迁移测试。
- 三个平台密钥库允许、拒绝、锁定、服务缺失和删除测试。
- 打包后的原生依赖启动和升级测试。

## 实施记录

决策已接受，等待原型证据，尚未实施。
