/** @type {Readonly<Record<string, {readonly architecture: "x64"|"arm64", readonly artifactName: string}>>} */
const platformMatrix = Object.freeze({
  linux: Object.freeze({
    architecture: "x64",
    artifactName: "ZTools-linux-x64",
  }),
  win32: Object.freeze({
    architecture: "x64",
    artifactName: "ZTools-win32-x64",
  }),
  darwin: Object.freeze({
    architecture: "arm64",
    artifactName: "ZTools-darwin-arm64",
  }),
});

/**
 * Resolves one platform-native directory target from the accepted Gate 1 matrix.
 *
 * @param {string} platform Node's current process platform.
 * @param {string} architecture Node's current process architecture.
 * @returns {{platform: "linux"|"win32"|"darwin", architecture: "x64"|"arm64", artifactName: string}} The immutable native target.
 * @throws {Error} When the host platform or architecture is outside the accepted matrix.
 */
export function resolveDirectoryTarget(platform, architecture) {
  const target = platformMatrix[platform];
  if (target === undefined) {
    throw new Error(`Unsupported directory package platform: ${platform}`);
  }
  if (architecture !== target.architecture) {
    throw new Error(
      `Directory package requires ${platform}-${target.architecture}, received ${platform}-${architecture}`,
    );
  }
  return Object.freeze({
    platform,
    architecture: target.architecture,
    artifactName: target.artifactName,
  });
}

/**
 * Resolves the native executable path relative to a packaged directory.
 *
 * @param {{platform: "linux"|"win32"|"darwin"}} target The accepted native target.
 * @returns {string} The portable slash-delimited executable path.
 */
export function resolvePackagedExecutable(target) {
  if (target.platform === "darwin") {
    return "ZTools.app/Contents/MacOS/ZTools";
  }
  if (target.platform === "win32") return "ZTools.exe";
  return "ZTools";
}

/**
 * Resolves the application resources path relative to a packaged directory.
 *
 * @param {{platform: "linux"|"win32"|"darwin"}} target The accepted native target.
 * @returns {string} The portable slash-delimited resources directory.
 */
export function resolvePackagedResources(target) {
  return target.platform === "darwin"
    ? "ZTools.app/Contents/Resources"
    : "resources";
}
