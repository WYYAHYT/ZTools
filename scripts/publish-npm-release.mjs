import { createHash } from 'crypto'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFile } from 'child_process'
import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import { validateReleaseVersion } from './npm-release-packages.mjs'

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
 * 查询 npm registry 中指定包版本的完整性值。
 * @param {string} packageName npm 包名。
 * @param {string} version npm 包版本。
 * @param {string} registry npm registry 地址。
 * @returns {Promise<string | null>} 已发布版本的 dist.integrity，不存在时返回 null。
 * @throws {Error} registry 返回非 404 查询错误时抛出错误。
 */
async function readPublishedIntegrity(packageName, version, registry) {
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['view', `${packageName}@${version}`, 'dist.integrity', '--json', '--registry', registry],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 }
    )
    return JSON.parse(stdout) || null
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
  const publishedIntegrity = await readPublishedIntegrity(
    packageInfo.packageName,
    version,
    NPM_REGISTRY
  )

  // npm 版本不可覆盖；重跑只允许跳过字节完全一致的 tarball。
  if (publishedIntegrity) {
    if (publishedIntegrity !== localIntegrity) {
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
  await execFileAsync('npm', publishArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: process.env
  })

  // 发布成功后立即回查 npmjs，防止仅凭命令退出码遗漏 registry 侧的内容异常。
  const remoteIntegrity = await readPublishedIntegrity(
    packageInfo.packageName,
    version,
    NPM_REGISTRY
  )
  if (remoteIntegrity !== localIntegrity) {
    throw new Error(`${packageInfo.packageName}@${version} 发布后完整性校验失败`)
  }
  console.log(`已发布: ${packageInfo.packageName}@${version} (${distTag})`)
  return 'published'
}

/**
 * 等待 npmmirror 同步指定平台包版本。
 * @param {string} packageName npm 包名。
 * @param {string} version npm 包版本。
 * @param {number} timeoutMs 最大等待时间，单位毫秒。
 * @param {number} intervalMs 轮询间隔，单位毫秒。
 * @returns {Promise<boolean>} 同步完成返回 true，超时返回 false。
 */
async function waitForNpmmirror(packageName, version, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const integrity = await readPublishedIntegrity(packageName, version, NPMMIRROR_REGISTRY)
    if (integrity) return true

    // npmmirror 为最终一致系统，等待固定间隔后继续查询。
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
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

  // npmjs 发布是硬性条件；镜像同步超时只告警，避免最终一致延迟诱发重复发布。
  const mirrorResults = await Promise.all(
    manifest.packages.map(async (packageInfo) => ({
      packageName: packageInfo.packageName,
      synced: await waitForNpmmirror(packageInfo.packageName, version, 5 * 60 * 1000, 15 * 1000)
    }))
  )
  for (const result of mirrorResults) {
    if (result.synced) console.log(`npmmirror 已同步: ${result.packageName}@${version}`)
    else console.warn(`npmmirror 暂未同步: ${result.packageName}@${version}`)
  }
}

await main()
