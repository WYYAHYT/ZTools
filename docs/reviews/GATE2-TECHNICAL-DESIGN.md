# Gate 2 Host Search 技术设计评审记录

- Status: accepted
- Recorded: 2026-08-26
- Decider: development agent under delegated technical authority
- Accountable owner: zhangchonghao
- Verification owner: zhangchonghao
- Authority: [Maintainer communication and delegated authority](../MAINTAINER_COMMUNICATION.md)

## 评审范围

本评审只决定 Host Search 增量结果的技术传输形态，不批准 Gate 2 产品范围、不关闭 Gate 1、不触发外部服务，也不承诺 Windows/macOS 已验证。

已评审：

- 单响应、轮询和连接绑定有界事件流三种方案。
- trusted connection 身份、session/stream 所有权、sequence、ack 和背压。
- 取消、deadline、Renderer reload/hide/崩溃与资源释放。
- 查询/结果正文不进入日志和失败产物。
- Search Application 与 Electron/传输层依赖隔离。

## 决定

接受 ADR-0013 的方案 C：Host Search 使用专用、连接绑定、有界、可确认批次的事件流。Bridge 只暴露命名的 `startSearch`、`cancel` 和内部固定 ack 行为，不提供通用事件总线、任意 channel 或 MessagePort 对象。

该决定属于 Level 2 技术架构补充，但不改变既定产品方向、不产生费用、不操作外部账号、不扩大插件或 Renderer 权限，因此由开发 agent 按委托权限决定。

## 实现前仍需满足

- `specs/HOST_VERTICAL_SLICE.md` 获得产品层接受。
- `threat-model/GATE2_HOST_SEARCH.md` 在产品规格固定后完成一致性评审并接受。
- Gate 1 的阶段转换按独立评审记录决定；本记录不能替代三平台证据。
- 实现必须先建立 Search Domain/Application、Provider Port 和 Contract Schema，不能直接在 Electron Main/Renderer 堆叠业务状态。

## 验证要求

- Contract、状态机、背压、跨连接拒绝、断线和资源压力自动测试。
- dependency-cruiser 阻断 Search Domain/Application 导入 Electron、Vue、Node 平台 API和传输实现。
- Electron E2E 覆盖快速查询替换、无 ack、hide、reload 和 render-process-gone。
- Windows、macOS、GNOME Wayland 的证据层必须按验收规格分别记录。
