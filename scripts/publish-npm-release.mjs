import { createHash } from 'crypto'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFile } from 'child_process'
import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import { validateReleaseVersion } from './npm-release-packages.mjs'
import { triggerNpmmirrorSync } from './npmmirror-sync.mjs'

const execFileAsync = promisify(execFile)
const NPM_REGISTRY = 'https://registry.npmjs.org/'
const NPMMIRROR_REGISTRY = 'https://registry.npmmirror.com/'

/**
 * 读取命令行参数值，未提供时返回默认值。
 * @param {string[]} args 命令行参数数组。
 * @param {string} name 参数名称，包含前导双横线。
 * @param {string} fallback 未提供参数时使用的默认值。
 * @returns {string} 解析后的参数值。
 * @throws {Error} 参数存在但缺少值时抛出错误。
 */
function readArgument(args, name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`参数缺少值: ${name}`)
  return value
}

/**
 * 计算 npm tarball 对应的 SHA-512 SRI 字符串。
 * @param {string} filePath npm tarball 文件路径。
 * @returns {Promise<string>} 以 sha512- 开头的 SRI 完整性值。
 * @throws {Error} tarball 读取失败时拒绝 Promise。
 */
async function calculateTarballIntegrity(filePath) {
  const hash = createHash('sha512')

  // 流式计算本地 tarball，供幂等重跑时与 npm dist.integrity 比对。
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('end', resolve)
    stream.once('error', reject)
  })
  return `sha512-${hash.digest('base64')}`
}

/**
 * 查询 npm registry 中指定包版本的分发信息。
 * @param {string} packageName npm 包名。
 * @param {string} version npm 包版本。
 * @param {string} registry npm registry 地址。
 * @returns {Promise<{integrity: string, tarball: string} | null>} 已发布版本的分发信息，不存在时返回 null。
 * @throws {Error} registry 返回非 404 查询错误时抛出错误。
 */
async function readPublishedDist(packageName, version, registry) {
  try {
    const { stdout } = await execFileAsync(
      'npm',
      [
        'view',
        `${packageName}@${version}`,
        'dist.integrity',
        'dist.tarball',
        '--json',
        '--prefer-online',
        '--registry',
        registry
      ],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 }
    )
    const dist = JSON.parse(stdout)
    if (!dist?.['dist.integrity'] || !dist?.['dist.tarball']) return null
    return {
      integrity: dist['dist.integrity'],
      tarball: dist['dist.tarball']
    }
  } catch (error) {
    const stderr = String(error?.stderr || '')
    if (stderr.includes('E404') || stderr.includes('404 Not Found')) return null
    throw error
  }
}

/**
 * 发布单个平台包，已存在且内容相同时安全跳过。
 * @param {Record<string, any>} packageInfo release 清单中的平台包信息。
 * @param {string} version 发布版本号。
 * @param {string} distTag npm dist-tag。
 * @returns {Promise<'published' | 'skipped'>} 实际执行的发布结果。
 * @throws {Error} 同版本内容冲突或 npm publish 失败时抛出错误。
 */
async function publishPackage(packageInfo, version, distTag) {
  const localIntegrity = await calculateTarballIntegrity(packageInfo.tarball)
  const publishedDist = await readPublishedDist(packageInfo.packageName, version, NPM_REGISTRY)

  // npm 版本不可覆盖；重跑只允许跳过字节完全一致的 tarball。
  if (publishedDist) {
    if (publishedDist.integrity !== localIntegrity) {
      throw new Error(`${packageInfo.packageName}@${version} 已存在，但 tarball 完整性不一致`)
    }
    console.log(`跳过已发布且完整性一致的版本: ${packageInfo.packageName}@${version}`)
    return 'skipped'
  }

  const publishArgs = [
    'publish',
    packageInfo.tarball,
    '--access',
    'public',
    '--tag',
    distTag,
    '--registry',
    NPM_REGISTRY
  ]
  if (process.env.GITHUB_ACTIONS === 'true') publishArgs.push('--provenance')

  // 认证信息仅通过 NODE_AUTH_TOKEN 和 setup-node 生成的临时 npmrc 传递。
  const publishResult = await execFileAsync('npm', publishArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: process.env
  })
  if (publishResult.stdout.trim()) console.log(publishResult.stdout.trim())
  if (publishResult.stderr.trim()) console.log(publishResult.stderr.trim())

  console.log(`已发布: ${packageInfo.packageName}@${version} (${distTag})`)
  return 'published'
}

/**
 * 等待 registry 暴露指定版本，并确认其 tarball 完整性符合预期。
 * @param {string} packageName npm 包名。
 * @param {string} version npm 包版本。
 * @param {string} registry npm registry 地址。
 * @param {string} expectedIntegrity 期望的 tarball SRI 完整性值。
 * @param {number} timeoutMs 最大等待时间，单位毫秒。
 * @param {number} intervalMs 轮询间隔，单位毫秒。
 * @param {string[]} requiredTarballHosts 可接受的 tarball 域名；为空时不限制域名。
 * @returns {Promise<{integrity: string, tarball: string, downloadUrl: string} | null>} 可见、完整性一致且可下载时返回分发信息，超时返回 null。
 * @throws {Error} registry 返回了与本地 tarball 不同的完整性值时抛出错误。
 */
async function waitForRegistryIntegrity(
  packageName,
  version,
  registry,
  expectedIntegrity,
  timeoutMs,
  intervalMs,
  requiredTarballHosts = []
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const dist = await readPublishedDist(packageName, version, registry)
    if (dist?.integrity && dist.integrity !== expectedIntegrity) {
      throw new Error(`${packageName}@${version} registry 完整性不一致: ${registry}`)
    }
    if (dist?.integrity === expectedIntegrity) {
      const tarballHost = new URL(dist.tarball).hostname
      const hostMatches =
        requiredTarballHosts.length === 0 || requiredTarballHosts.includes(tarballHost)
      const downloadUrl = hostMatches ? await resolveTarballDownloadUrl(dist.tarball) : null
      if (downloadUrl) return { ...dist, downloadUrl }
    }

    // registry 元数据为最终一致读取，等待固定间隔后继续查询。
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return null
}

/**
 * 通过 HEAD 请求确认 registry 返回的 tarball 已可实际下载，并解析最终 CDN 地址。
 * @param {string} tarballUrl registry 元数据中的 tarball 地址。
 * @returns {Promise<string | null>} 最终响应成功时返回重定向后的 URL，否则返回 null。
 */
async function resolveTarballDownloadUrl(tarballUrl) {
  try {
    const response = await fetch(tarballUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(15 * 1000)
    })
    return response.ok ? response.url : null
  } catch {
    return null
  }
}

/**
 * 发布清单中的所有平台包并验证 npmjs 与 npmmirror 可见性。
 * @returns {Promise<void>} 发布与验证完成后结束的 Promise。
 * @throws {Error} 清单无效、认证缺失或 npm 发布失败时抛出错误。
 */
async function main() {
  if (!process.env.NODE_AUTH_TOKEN) throw new Error('缺少 NODE_AUTH_TOKEN')

  const args = process.argv.slice(2)
  const manifestPath = path.resolve(
    readArgument(args, '--manifest', 'dist/npm-release/release-manifest.json')
  )
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const version = validateReleaseVersion(manifest.version)
  const distTag = readArgument(args, '--tag', manifest.distTag)
  if (!['latest', 'next'].includes(distTag)) throw new Error(`不允许的 npm dist-tag: ${distTag}`)
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== 3) {
    throw new Error('npm release 清单必须包含三个平台包')
  }

  // 依次发布不可原子提交的 npm 包，幂等校验保证失败后可以安全重跑。
  for (const packageInfo of manifest.packages) {
    await publishPackage(packageInfo, version, distTag)
  }

  // 三个平台先全部上传，再并行等待首次发布在 npmjs 上完成公开传播。
  const packageIntegrities = await Promise.all(
    manifest.packages.map(async (packageInfo) => ({
      ...packageInfo,
      integrity: await calculateTarballIntegrity(packageInfo.tarball)
    }))
  )
  const npmjsResults = await Promise.all(
    packageIntegrities.map(async (packageInfo) => ({
      packageName: packageInfo.packageName,
      dist: await waitForRegistryIntegrity(
        packageInfo.packageName,
        version,
        NPM_REGISTRY,
        packageInfo.integrity,
        10 * 60 * 1000,
        15 * 1000
      )
    }))
  )
  const npmjsTimeout = npmjsResults.find((result) => !result.dist)
  if (npmjsTimeout) {
    throw new Error(`${npmjsTimeout.packageName}@${version} 发布后等待 npmjs 可见性超时`)
  }

  // npmjs 已可读取新版本后主动创建镜像任务，避免 changes stream 延迟。
  const syncRequests = await Promise.all(
    packageIntegrities.map(async (packageInfo) => ({
      packageName: packageInfo.packageName,
      result: await triggerNpmmirrorSync(packageInfo.packageName)
    }))
  )
  for (const request of syncRequests) {
    if (request.result.triggered) {
      console.log(
        `已触发 npmmirror 同步: ${request.packageName}@${version}, taskId=${request.result.taskId}, state=${request.result.state}`
      )
    } else {
      console.warn(
        `触发 npmmirror 同步失败，将继续等待自动同步: ${request.packageName}@${version}, error=${request.result.error}`
      )
    }
  }

  // npmjs 发布是硬性条件；镜像同步超时只告警，避免最终一致延迟诱发重复发布。
  const mirrorResults = await Promise.all(
    packageIntegrities.map(async (packageInfo) => ({
      packageName: packageInfo.packageName,
      dist: await waitForRegistryIntegrity(
        packageInfo.packageName,
        version,
        NPMMIRROR_REGISTRY,
        packageInfo.integrity,
        15 * 60 * 1000,
        15 * 1000,
        ['registry.npmmirror.com', 'cdn.npmmirror.com']
      )
    }))
  )
  for (const result of mirrorResults) {
    if (result.dist) {
      console.log(
        `npmmirror 已同步: ${result.packageName}@${version}, registry=${result.dist.tarball}, download=${result.dist.downloadUrl}`
      )
    } else console.warn(`npmmirror 暂未同步: ${result.packageName}@${version}`)
  }
}

await main()
