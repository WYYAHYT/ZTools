import { packager } from "@electron/packager";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  resolveDirectoryTarget,
  resolvePackagedExecutable,
  resolvePackagedResources,
} from "./directory-platform-matrix.mjs";

const desktopDirectory = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(desktopDirectory, "../..");
const outputDirectory = resolve(repositoryRoot, "artifacts/desktop-directory");
const electronVersion = "44.0.0";
const applicationName = "ZTools";
const target = resolveDirectoryTarget(process.platform, process.arch);
const stagingDirectory = await mkdtemp(
  join(tmpdir(), "ztools-directory-package-"),
);

/**
 * Creates the minimal application payload consumed by Electron Packager.
 *
 * @returns Nothing after production files and the runtime-only manifest are staged.
 */
async function stageApplication() {
  const stagedMain = join(stagingDirectory, "dist/main");
  const stagedRenderer = join(stagingDirectory, "dist/renderer");
  await mkdir(stagedMain, { recursive: true });
  await cp(resolve(desktopDirectory, "dist/renderer"), stagedRenderer, {
    recursive: true,
  });
  await Promise.all([
    cp(
      resolve(desktopDirectory, "dist/main/main.js"),
      join(stagedMain, "main.js"),
    ),
    cp(
      resolve(desktopDirectory, "dist/main/preload-bridge.cjs"),
      join(stagedMain, "preload-bridge.cjs"),
    ),
    writeFile(
      join(stagingDirectory, "package.json"),
      `${JSON.stringify(
        {
          name: "ztools-vnext",
          productName: applicationName,
          version: "0.0.0",
          private: true,
          type: "module",
          main: "dist/main/main.js",
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  ]);
}

/**
 * Verifies the staging payload cannot silently absorb source, tests or dependencies.
 *
 * @returns Nothing when the complete staged tree matches the fixed runtime allowlist.
 * @throws {Error} When an unexpected staged file would enter the application archive.
 */
async function verifyStagingPayload() {
  const discovered = [];

  /**
   * Recursively collects staged file paths without following external workspace links.
   *
   * @param {string} directory The current absolute staging directory.
   * @param {string} prefix The portable relative path accumulated for diagnostics.
   * @returns {Promise<void>} Nothing after all regular descendants are recorded.
   */
  const visit = async (directory, prefix = "") => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath =
        prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(join(directory, entry.name), relativePath);
      } else {
        discovered.push(relativePath);
      }
    }
  };
  await visit(stagingDirectory);
  discovered.sort();
  const fixedFiles = [
    "dist/main/main.js",
    "dist/main/preload-bridge.cjs",
    "package.json",
  ];
  const unexpected = discovered.filter(
    (file) => !fixedFiles.includes(file) && !file.startsWith("dist/renderer/"),
  );
  if (
    unexpected.length > 0 ||
    !fixedFiles.every((file) => discovered.includes(file))
  ) {
    throw new Error(
      `Unexpected directory package payload: ${JSON.stringify({ unexpected, discovered })}`,
    );
  }
}

/**
 * Verifies the platform-native directory contains its executable and archived application.
 *
 * @param packagePath The final directory returned by Electron Packager.
 * @param target The accepted native target represented by the directory.
 * @returns Nothing after required files and the runtime manifest are validated.
 * @throws {Error} When the output is incomplete or contains the wrong application entry point.
 */
async function verifyDirectoryArtifact(packagePath, target) {
  const resourcesDirectory = join(
    packagePath,
    resolvePackagedResources(target),
  );
  const executablePath = join(packagePath, resolvePackagedExecutable(target));
  const [archive, executable] = await Promise.all([
    stat(join(resourcesDirectory, "app.asar")),
    stat(executablePath),
  ]);
  if (!archive.isFile() || archive.size === 0 || !executable.isFile()) {
    throw new Error(
      "Directory artifact is missing its runtime archive or executable",
    );
  }
  const manifest = JSON.parse(
    await readFile(join(stagingDirectory, "package.json"), "utf8"),
  );
  if (manifest.main !== "dist/main/main.js" || manifest.type !== "module") {
    throw new Error("Directory artifact runtime manifest is invalid");
  }
}

try {
  await stageApplication();
  await verifyStagingPayload();
  const packagePaths = await packager({
    dir: stagingDirectory,
    name: applicationName,
    appBundleId: "com.ztools.ZTools",
    appVersion: "0.0.0",
    electronVersion,
    platform: target.platform,
    arch: target.architecture,
    out: outputDirectory,
    overwrite: true,
    asar: true,
    prune: false,
  });
  if (packagePaths.length !== 1) {
    throw new Error(
      `Expected one directory artifact, received ${packagePaths.length}`,
    );
  }
  await verifyDirectoryArtifact(packagePaths[0], target);
  console.log(
    JSON.stringify({
      event: "ztools-directory-package-ready",
      platform: target.platform,
      architecture: target.architecture,
      directory: basename(packagePaths[0]),
    }),
  );
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
