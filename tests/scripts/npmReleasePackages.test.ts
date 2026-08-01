import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import yaml from 'yaml'
import {
  getNpmDistTag,
  NPM_RELEASE_PACKAGES,
  prepareNpmReleasePackages,
  validateReleaseVersion
} from '../../scripts/npm-release-packages.mjs'

const temporaryRoots: string[] = []

/**
 * 计算测试产物对应的 Base64 SHA-512。
 * @param content 测试文件内容。
 * @returns Base64 编码的 SHA-512。
 */
function sha512(content: string): string {
  return createHash('sha512').update(content).digest('base64')
}

/**
 * 创建包含三平台更新文件、blockmap 和 YAML 的临时发布工作区。
 * @param version 测试发布版本号。
 * @returns 临时工作区和构建产物目录。
 */
async function createReleaseFixture(version: string): Promise<{
  workspaceRoot: string
  inputRoot: string
}> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-npm-release-'))
  const inputRoot = path.join(workspaceRoot, 'dist')
  temporaryRoots.push(workspaceRoot)
  await fs.writeFile(path.join(workspaceRoot, 'LICENSE'), 'MIT fixture license\n')

  // 每个平台使用不同内容，确保摘要和文件选择不会跨平台串用。
  for (const config of NPM_RELEASE_PACKAGES) {
    const sourceDirectory = path.join(inputRoot, config.artifactDirectory)
    const artifactName = `ZTools-${version}${config.artifactSuffix}`
    const artifactContent = `${config.id} primary artifact`
    await fs.mkdir(sourceDirectory, { recursive: true })
    await fs.writeFile(path.join(sourceDirectory, artifactName), artifactContent)
    await fs.writeFile(
      path.join(sourceDirectory, `${artifactName}.blockmap`),
      `${config.id} blockmap`
    )
    await fs.writeFile(
      path.join(sourceDirectory, config.metadataFile),
      yaml.stringify({
        version,
        files: [{ url: artifactName, sha512: sha512(artifactContent) }],
        path: artifactName,
        sha512: sha512(artifactContent)
      })
    )
  }

  // Windows 便携 ZIP 即使存在，也不能进入 NSIS 平台包。
  await fs.writeFile(
    path.join(inputRoot, 'windows', `ZTools-${version}-win-x64.zip`),
    'portable zip must not be selected'
  )
  return { workspaceRoot, inputRoot }
}

afterEach(async () => {
  // 测试结束后仅清理当前测试创建的临时根目录。
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true })))
})

describe('npm release version metadata', () => {
  it('normalizes a leading v and selects next for prerelease versions', () => {
    expect(validateReleaseVersion('v3.0.2-beta.3')).toBe('3.0.2-beta.3')
    expect(getNpmDistTag('3.0.2-beta.3')).toBe('next')
    expect(getNpmDistTag('3.0.2')).toBe('latest')
  })

  it('rejects incomplete versions', () => {
    expect(() => validateReleaseVersion('3.0')).toThrow('无效的发布版本号')
  })
})

describe('npm release package preparation', () => {
  it('packs the macOS ZIPs and Windows NSIS installer into isolated platform packages', async () => {
    const version = '3.0.2-beta.3'
    const { workspaceRoot, inputRoot } = await createReleaseFixture(version)
    const outputRoot = path.join(workspaceRoot, 'npm-release')

    const manifest = await prepareNpmReleasePackages({
      inputRoot,
      outputRoot,
      workspaceRoot,
      version
    })

    expect(manifest.version).toBe(version)
    expect(manifest.distTag).toBe('next')
    expect(manifest.packages).toHaveLength(3)
    for (const packageInfo of manifest.packages) {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(packageInfo.packageDirectory, 'package.json'), 'utf8')
      )
      const artifactManifest = JSON.parse(
        await fs.readFile(path.join(packageInfo.packageDirectory, 'artifact.json'), 'utf8')
      )
      const tarEntries = execFileSync('tar', ['-tzf', packageInfo.tarball], {
        encoding: 'utf8'
      })

      expect(packageJson.version).toBe(version)
      expect(packageJson.os).toEqual([artifactManifest.platform])
      expect(packageJson.cpu).toEqual([artifactManifest.arch])
      expect(tarEntries).toContain('package/artifact.json')
      expect(tarEntries).toContain(`package/${artifactManifest.artifact.file}`)
      if (packageInfo.id === 'win32-x64') {
        expect(artifactManifest.type).toBe('nsis')
        expect(artifactManifest.artifact.file).toMatch(/-setup\.exe$/)
        expect(tarEntries).not.toContain(`ZTools-${version}-win-x64.zip`)
      }
    }
  })

  it('rejects an artifact whose checksum differs from electron-builder metadata', async () => {
    const version = '3.0.2-beta.3'
    const { workspaceRoot, inputRoot } = await createReleaseFixture(version)
    const metadataPath = path.join(inputRoot, 'windows', 'latest.yml')
    const metadata = yaml.parse(await fs.readFile(metadataPath, 'utf8'))
    metadata.files[0].sha512 = 'invalid'
    await fs.writeFile(metadataPath, yaml.stringify(metadata))

    await expect(
      prepareNpmReleasePackages({
        inputRoot,
        outputRoot: path.join(workspaceRoot, 'npm-release'),
        workspaceRoot,
        version
      })
    ).rejects.toThrow('SHA-512')
  })
})
