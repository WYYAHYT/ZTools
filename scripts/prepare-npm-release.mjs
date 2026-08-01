import path from 'path'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { prepareNpmReleasePackages } from './npm-release-packages.mjs'

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
 * 生成 CI 发布所需的三平台 npm tarball 和清单。
 * @returns {Promise<void>} 生成完成后结束的 Promise。
 * @throws {Error} 版本或任一构建产物校验失败时抛出错误。
 */
async function main() {
  const workspaceRoot = process.cwd()
  const version = readArgument(
    process.argv.slice(2),
    '--version',
    process.env.RELEASE_VERSION || ''
  )
  const inputRoot = path.resolve(
    readArgument(process.argv.slice(2), '--input', path.join(workspaceRoot, 'dist'))
  )
  const outputRoot = path.resolve(
    readArgument(process.argv.slice(2), '--output', path.join(workspaceRoot, 'dist', 'npm-release'))
  )

  // 输出机器可读清单摘要，便于 CI 日志核对包名、版本和 dist-tag。
  const manifest = await prepareNpmReleasePackages({
    inputRoot,
    outputRoot,
    workspaceRoot,
    version
  })
  console.log(
    JSON.stringify(
      {
        version: manifest.version,
        distTag: manifest.distTag,
        packages: manifest.packages.map((item) => ({
          name: item.packageName,
          tarball: item.tarball,
          artifact: item.artifact.file
        }))
      },
      null,
      2
    )
  )
}

await main()
