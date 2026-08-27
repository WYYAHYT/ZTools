# Gate 1 工具链隔离验证记录

- Status: accepted
- Validation date: 2026-08-26
- Decider: development agent under delegated technical authority
- Accountable owner: zhangchonghao
- Validation environment: Ubuntu 26.04 LTS x86_64、GNOME、原生 Wayland `wayland-0`
- Prototype location: `/tmp/ztools-gate1-toolchain-validation`
- Cleanup: 正式 workspace 验证完成后删除；不得合入原型源码、锁文件或生成物

## 目的与范围

本原型只验证 Gate 1 工具链、最小安全窗口、生产构建和目录产物，不实现 Domain、Application、Contract Gateway 或产品功能。维护者已允许下载公开依赖并运行临时验证，不使用云 CI、远程设备、付费服务或外部账号。

## 固定候选

- Node.js `24.18.0`、Corepack `0.35.0`、pnpm `11.24.0`。
- Electron `44.0.0`、Vue `3.5.41`、TypeScript `5.9.3`、Vite `8.2.2`。
- `@vitejs/plugin-vue` `6.0.8`、`@types/node` `24.10.1`、`@electron/packager` `20.3.0`。
- 原型 pnpm 锁文件 SHA-256：`2d7e554441b5bf28a056e61e59dc5b90020ae9d3400e10e40c3bbad6bb275e38`。

## 执行与结果

| 验证 | 结果 | 证据摘要 |
| --- | --- | --- |
| 依赖安装 | 通过 | pnpm 11.24.0 完成解析，供应链策略检查通过 |
| peer dependency | 通过 | 初始 Vue 插件 6.0.1 不支持 Vite 8；升级固定到 6.0.8 后依赖安装、类型检查和构建无 peer 冲突；pnpm 11.24.0 的 `peers check` 对当前 workspace 空 importer 存在自身异常，不作为正式门禁 |
| Main 类型检查 | 通过 | TypeScript 7 strict 构建通过；发现并移除 Electron 44 已不存在的 `getLastWebPreferences` 用法 |
| Renderer 构建 | 通过 | Vite 8.2.2 生产构建，12 modules，JS 约 60.8 KiB |
| Electron 开发启动 | 通过 | 原生 Wayland 启动，自动加载 Vue 页面并正常退出 |
| Linux x64 目录产物 | 通过 | 约 282 MiB，产物在原生 Wayland 启动 |
| Windows x64 目录产物 | 仅资源验证 | Linux 交叉生成约 366 MiB，未在 Windows 启动 |
| macOS arm64 目录产物 | 仅资源验证 | Linux 交叉生成约 306 MiB；packager 明确警告无法恢复 codesign/asar integrity |

关键运行输出：

```json
{
  "event": "ztools-validation-ready",
  "electron": "44.0.0",
  "chrome": "152.0.7977.54",
  "node": "24.18.1",
  "ozonePlatformHint": "wayland",
  "sessionType": "wayland",
  "waylandDisplay": "wayland-0",
  "security": {
    "contextIsolation": true,
    "nodeIntegration": false,
    "sandbox": true,
    "webSecurity": true
  },
  "rendererIsolation": {
    "processType": "undefined",
    "requireType": "undefined"
  }
}
```

## 发现与处置

1. Corepack 在当前 shell 中没有生成全局 `pnpm` shim，因此正式脚本不能假定裸 `pnpm` 命令一定存在；仓库固定 `packageManager`，环境准备阶段显式执行 Corepack。
2. `@vitejs/plugin-vue` 6.0.1 的 peer 范围不含 Vite 8，已否决；6.0.8 明确支持 Vite 8。
3. Electron 44 类型中没有 `WebContents.getLastWebPreferences()`；安全配置应由受审查的创建参数和 Renderer 隔离测试共同验证。
4. Electron Packager 直接裁剪 pnpm 隔离依赖树时无法定位 Vue 传递依赖。生产 Renderer 已是静态文件，目录打包采用只含 `dist` 和运行 manifest 的 staging 输入，不携带开发依赖树。
5. Electron 44 原生 Wayland 启动会输出 Vulkan 不兼容警告，即使传入禁用 Vulkan 参数仍存在；当前未观察到启动失败，但正式 workspace 必须保留回归项，不允许退回 X11 冒充解决。
6. 打包产物退出阶段出现外部 SSL 握手尝试。原型没有业务网络代码，正式 Host UI 必须通过 CSP、会话策略和网络观测确认无隐式远程内容或静默联网。
7. 正式 workspace 首轮 peer 检查发现 TypeScript 7.0.2 超出 `typescript-eslint` 当前支持范围，ESLint 10 也超出相关插件范围。正式基线据此固定为 TypeScript 5.9.3 与 ESLint 9.39.5；原型中的 TypeScript 7 结果只保留为候选被否决前的构建证据。Electron 自带声明依赖 DOM 类型且存在跨运行时声明冲突，正式基线对外部声明启用 `skipLibCheck`，业务源码仍保持 strict 检查。

## 决定

现有证据足以固定正式工具版本并允许创建 Gate 1 workspace。Windows/macOS 的真实启动、E2E、签名和交互证据仍缺失，必须在 Gate 1 退出和后续平台里程碑补齐；本决定不改变三个一等目标平台，也不构成公开支持承诺。
