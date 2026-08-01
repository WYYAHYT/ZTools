import { createHash } from 'crypto'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFile } from 'child_process'
import { createReadStream } from 'fs'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import yaml from 'yaml'

const execFileAsync = promisify(execFile)

export const NPM_RELEASE_PACKAGES = [
  {
    id: 'darwin-arm64',
    packageName: '@ztools-center/ztools-darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    artifactDirectory: 'mac-arm64',
    artifactSuffix: '-mac-arm64.zip',
    artifactType: 'zip',
    metadataFile: 'latest-mac.yml'
  },
  {
    id: 'darwin-x64',
    packageName: '@ztools-center/ztools-darwin-x64',
    os: 'darwin',
    cpu: 'x64',
    artifactDirectory: 'mac-x64',
    artifactSuffix: '-mac-x64.zip',
    artifactType: 'zip',
    metadataFile: 'latest-mac.yml'
  },
  {
    id: 'win32-x64',
    packageName: '@ztools-center/ztools-win32-x64',
    os: 'win32',
    cpu: 'x64',
    artifactDirectory: 'windows',
    artifactSuffix: '-win-x64-setup.exe',
    artifactType: 'nsis',
    metadataFile: 'latest.yml'
  }
]

/**
 * 校验发布版本是否为 npm 可接受的标准 SemVer。
 * @param {string} version 待校验的版本号，不包含前导 v。
 * @returns {string} 校验通过并去除首尾空白的版本号。
 * @throws {Error} 版本号为空或格式无效时抛出错误。
 */
export function validateReleaseVersion(version) {
  const normalized = String(version || '')
    .trim()
    .replace(/^v/, '')
  const semverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  if (!semverPattern.test(normalized)) throw new Error(`无效的发布版本号: ${version}`)
  return normalized
}

/**
 * 根据版本号选择 npm dist-tag，避免预发布版本覆盖 latest。
 * @param {string} version 已校验的发布版本号。
 * @returns {'latest' | 'next'} 正式版使用 latest，预发布版使用 next。
 */
export function getNpmDistTag(version) {
  return version.includes('-') ? 'next' : 'latest'
}

/**
 * 计算文件的 SHA-512，并返回 electron-builder 使用的 Base64 表示。
 * @param {string} filePath 待计算摘要的文件路径。
 * @returns {Promise<string>} Base64 编码的 SHA-512。
 * @throws {Error} 文件读取失败时拒绝 Promise。
 */
export async function calculateFileSha512(filePath) {
  const hash = createHash('sha512')

  // 使用流式计算，避免百兆级发布文件整体进入内存。
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('end', resolve)
    stream.once('error', reject)
  })
  return hash.digest('base64')
}

/**
 * 在构建目录中查找唯一的目标更新文件。
 * @param {string} sourceDirectory 单平台构建产物目录。
 * @param {string} version 发布版本号。
 * @param {string} artifactSuffix 平台文件名后缀。
 * @returns {Promise<string>} 唯一匹配的更新文件绝对路径。
 * @throws {Error} 未找到文件或存在多个匹配项时抛出错误。
 */
export async function findReleaseArtifact(sourceDirectory, version, artifactSuffix) {
  const expectedName = `ZTools-${version}${artifactSuffix}`
  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  const matches = entries.filter((entry) => entry.isFile() && entry.name === expectedName)
  if (matches.length !== 1) {
    throw new Error(`必须且只能找到一个发布文件: ${path.join(sourceDirectory, expectedName)}`)
  }
  return path.join(sourceDirectory, matches[0].name)
}

/**
 * 读取并校验 electron-builder 元数据中的版本和主更新文件摘要。
 * @param {string} metadataPath 更新元数据文件路径。
 * @param {string} version 期望的发布版本号。
 * @param {string} artifactName 主更新文件名。
 * @param {string} artifactSha512 主更新文件实际 SHA-512。
 * @returns {Promise<Record<string, any>>} 校验通过的更新元数据。
 * @throws {Error} 元数据格式、版本、文件引用或摘要不一致时抛出错误。
 */
export async function validateUpdateMetadata(metadataPath, version, artifactName, artifactSha512) {
  const metadata = yaml.parse(await readFile(metadataPath, 'utf8'))
  if (!metadata || typeof metadata !== 'object')
    throw new Error(`更新元数据格式无效: ${metadataPath}`)
  if (metadata.version !== version) {
    throw new Error(`更新元数据版本不一致: ${metadata.version || 'unknown'} / ${version}`)
  }

  // 仅接受与平台主更新文件完全同名的记录，防止把 DMG 或便携 ZIP 发布为更新入口。
  const files = Array.isArray(metadata.files) ? metadata.files : []
  const artifactEntries = files.filter(
    (file) => path.basename(String(file?.url || '')) === artifactName
  )
  if (artifactEntries.length !== 1) {
    throw new Error(`更新元数据必须且只能引用一次主更新文件: ${artifactName}`)
  }
  if (artifactEntries[0].sha512 !== artifactSha512) {
    throw new Error(`更新元数据 SHA-512 与主更新文件不一致: ${artifactName}`)
  }
  return metadata
}

/**
 * 确认输出目录位于指定工作区内且不会覆盖工作区根目录。
 * @param {string} workspaceRoot 发布工作区根目录。
 * @param {string} outputRoot npm staging 输出目录。
 * @returns {void} 校验通过时无返回值。
 * @throws {Error} 输出目录越界或等于工作区根目录时抛出错误。
 */
function validateOutputRoot(workspaceRoot, outputRoot) {
  const resolvedWorkspace = path.resolve(workspaceRoot)
  const resolvedOutput = path.resolve(outputRoot)
  if (
    resolvedOutput === resolvedWorkspace ||
    !resolvedOutput.startsWith(`${resolvedWorkspace}${path.sep}`)
  ) {
    throw new Error(`npm 发布输出目录必须位于工作区子目录中: ${resolvedOutput}`)
  }
}

/**
 * 为单个平台生成可发布的 npm 包目录及完整性清单。
 * @param {object} options 平台包生成参数。
 * @param {Record<string, string>} options.config 平台包配置。
 * @param {string} options.inputRoot 三平台构建产物根目录。
 * @param {string} options.packagesRoot npm 包输出根目录。
 * @param {string} options.workspaceRoot 仓库或测试工作区根目录。
 * @param {string} options.version 发布版本号。
 * @returns {Promise<Record<string, any>>} 生成的平台包摘要。
 * @throws {Error} 构建产物、元数据或摘要校验失败时抛出错误。
 */
async function preparePlatformPackage({ config, inputRoot, packagesRoot, workspaceRoot, version }) {
  const sourceDirectory = path.join(inputRoot, config.artifactDirectory)
  const artifactPath = await findReleaseArtifact(sourceDirectory, version, config.artifactSuffix)
  const artifactName = path.basename(artifactPath)
  const blockmapPath = `${artifactPath}.blockmap`
  const metadataPath = path.join(sourceDirectory, config.metadataFile)

  // 在复制前读取所有必需文件，确保任何平台缺失都会阻止整个发布。
  await Promise.all([
    stat(blockmapPath),
    stat(metadataPath),
    stat(path.join(workspaceRoot, 'LICENSE'))
  ])
  const [artifactSha512, blockmapSha512, artifactStats, blockmapStats] = await Promise.all([
    calculateFileSha512(artifactPath),
    calculateFileSha512(blockmapPath),
    stat(artifactPath),
    stat(blockmapPath)
  ])
  await validateUpdateMetadata(metadataPath, version, artifactName, artifactSha512)

  const packageDirectory = path.join(packagesRoot, config.id)
  const artifactsDirectory = path.join(packageDirectory, 'artifacts')
  await mkdir(artifactsDirectory, { recursive: true })

  // 保留 electron-builder 原始文件名，方便与 GitHub Release 和 YAML 相互核对。
  await Promise.all([
    copyFile(artifactPath, path.join(artifactsDirectory, artifactName)),
    copyFile(blockmapPath, path.join(artifactsDirectory, path.basename(blockmapPath))),
    copyFile(metadataPath, path.join(artifactsDirectory, config.metadataFile)),
    copyFile(path.join(workspaceRoot, 'LICENSE'), path.join(packageDirectory, 'LICENSE'))
  ])

  const packageJson = {
    name: config.packageName,
    version,
    description: `ZTools release artifacts for ${config.id}`,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'https://github.com/ZToolsCenter/ZTools.git'
    },
    os: [config.os],
    cpu: [config.cpu],
    files: ['artifacts', 'artifact.json', 'README.md', 'LICENSE'],
    publishConfig: {
      access: 'public',
      registry: 'https://registry.npmjs.org/'
    }
  }
  const artifactManifest = {
    schemaVersion: 1,
    version,
    platform: config.os,
    arch: config.cpu,
    type: config.artifactType,
    artifact: {
      file: `artifacts/${artifactName}`,
      size: artifactStats.size,
      sha512: artifactSha512
    },
    blockmap: {
      file: `artifacts/${path.basename(blockmapPath)}`,
      size: blockmapStats.size,
      sha512: blockmapSha512
    },
    metadata: `artifacts/${config.metadataFile}`
  }
  const readme = `# ${config.packageName}\n\nZTools ${version} release artifacts for ${config.id}.\n`

  await Promise.all([
    writeFile(
      path.join(packageDirectory, 'package.json'),
      `${JSON.stringify(packageJson, null, 2)}\n`
    ),
    writeFile(
      path.join(packageDirectory, 'artifact.json'),
      `${JSON.stringify(artifactManifest, null, 2)}\n`
    ),
    writeFile(path.join(packageDirectory, 'README.md'), readme)
  ])

  return {
    id: config.id,
    packageName: config.packageName,
    packageDirectory,
    artifact: artifactManifest.artifact
  }
}

/**
 * 使用 npm pack 预先生成平台包 tarball，确保发布前所有包均可打包。
 * @param {Array<Record<string, any>>} packages 已准备的平台包摘要。
 * @param {string} tarballsRoot tarball 输出目录。
 * @returns {Promise<Array<Record<string, any>>>} 附带 tarball 路径和 npm pack 信息的平台包摘要。
 * @throws {Error} npm pack 失败或输出格式异常时抛出错误。
 */
async function packPreparedPackages(packages, tarballsRoot) {
  await mkdir(tarballsRoot, { recursive: true })
  const packedPackages = []

  // 全部包准备完成后再统一打包，发布阶段不再修改任何包内容。
  for (const packageInfo of packages) {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', packageInfo.packageDirectory, '--pack-destination', tarballsRoot, '--json'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    )
    const packResult = JSON.parse(stdout)
    if (!Array.isArray(packResult) || packResult.length !== 1 || !packResult[0].filename) {
      throw new Error(`npm pack 输出格式无效: ${packageInfo.packageName}`)
    }
    packedPackages.push({
      ...packageInfo,
      tarball: path.join(tarballsRoot, packResult[0].filename),
      packedSize: packResult[0].size,
      unpackedSize: packResult[0].unpackedSize
    })
  }
  return packedPackages
}

/**
 * 从三平台构建产物生成并预打包所有 npm release 包。
 * @param {object} options 发布准备参数。
 * @param {string} options.inputRoot 三平台构建产物根目录。
 * @param {string} options.outputRoot npm staging 输出目录。
 * @param {string} options.workspaceRoot 仓库或测试工作区根目录。
 * @param {string} options.version 发布版本号。
 * @returns {Promise<Record<string, any>>} 包含 dist-tag 和 tarball 路径的发布清单。
 * @throws {Error} 参数不安全或任一平台包准备失败时抛出错误。
 */
export async function prepareNpmReleasePackages({ inputRoot, outputRoot, workspaceRoot, version }) {
  const normalizedVersion = validateReleaseVersion(version)
  validateOutputRoot(workspaceRoot, outputRoot)

  // staging 是可再生目录，每次从已下载的构建产物重新生成。
  await rm(outputRoot, { recursive: true, force: true })
  const packagesRoot = path.join(outputRoot, 'packages')
  const packageSummaries = []
  for (const config of NPM_RELEASE_PACKAGES) {
    packageSummaries.push(
      await preparePlatformPackage({
        config,
        inputRoot,
        packagesRoot,
        workspaceRoot,
        version: normalizedVersion
      })
    )
  }

  const packages = await packPreparedPackages(packageSummaries, path.join(outputRoot, 'tarballs'))
  const manifest = {
    schemaVersion: 1,
    version: normalizedVersion,
    distTag: getNpmDistTag(normalizedVersion),
    packages
  }
  await writeFile(
    path.join(outputRoot, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  return manifest
}
