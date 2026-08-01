/* eslint-disable @typescript-eslint/explicit-function-return-type */
const NPMMIRROR_DIRECT_REGISTRY = 'https://registry-direct.npmmirror.com'

/**
 * 构造 npmmirror 公共包同步任务地址，并保留官方路由要求的 scoped package 原始路径。
 * @param {string} packageName npm 包名。
 * @returns {string} 可用于创建同步任务的完整 URL。
 * @throws {Error} 包名为空或不是 scoped package 时抛出错误。
 */
export function buildNpmmirrorSyncUrl(packageName) {
  if (!/^@[^/]+\/[^/]+$/.test(packageName)) {
    throw new Error(`无效的 scoped npm 包名: ${packageName}`)
  }

  // registry-direct 路由不接受编码后的 %40，包名已通过严格格式校验可直接拼入路径。
  return `${NPMMIRROR_DIRECT_REGISTRY}/-/package/${packageName}/syncs`
}

/**
 * 请求 npmmirror 创建公共包同步任务，短暂故障时按固定间隔重试。
 * @param {string} packageName npm 包名。
 * @param {{fetchImplementation?: typeof fetch, attempts?: number, intervalMs?: number}} options 请求选项。
 * @returns {Promise<{triggered: boolean, taskId?: string, state?: string, error?: string}>} 同步任务创建结果。
 * @throws {Error} 包名为空或不是 scoped package 时抛出错误。
 */
export async function triggerNpmmirrorSync(
  packageName,
  { fetchImplementation = fetch, attempts = 3, intervalMs = 5 * 1000 } = {}
) {
  const syncUrl = buildNpmmirrorSyncUrl(packageName)
  let lastError = ''

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // 官方网页以匿名 PUT 创建任务，不向 npmmirror 传递 npm 认证信息。
      const response = await fetchImplementation(syncUrl, {
        method: 'PUT',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15 * 1000)
      })
      const data = await response.json()
      if (!response.ok || !data?.ok || !data?.id) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`)
      }

      return {
        triggered: true,
        taskId: data.id,
        state: data.state
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt === attempts) break

      // 创建任务失败可能是入口限流或网络抖动，等待后再次尝试。
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  return { triggered: false, error: lastError }
}
