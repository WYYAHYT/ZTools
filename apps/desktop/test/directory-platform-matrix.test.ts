import { describe, expect, it } from "vitest";

import {
  resolveDirectoryTarget,
  resolvePackagedExecutable,
  resolvePackagedResources,
} from "../scripts/directory-platform-matrix.mjs";

describe("directory artifact platform matrix", () => {
  it.each([
    ["linux", "x64", "ZTools-linux-x64", "ZTools", "resources"],
    ["win32", "x64", "ZTools-win32-x64", "ZTools.exe", "resources"],
    [
      "darwin",
      "arm64",
      "ZTools-darwin-arm64",
      "ZTools.app/Contents/MacOS/ZTools",
      "ZTools.app/Contents/Resources",
    ],
  ] as const)(
    "accepts %s-%s and fixes its native paths",
    (platform, architecture, artifactName, executable, resources) => {
      const target = resolveDirectoryTarget(platform, architecture);

      expect(target).toEqual({ platform, architecture, artifactName });
      expect(Object.isFrozen(target)).toBe(true);
      expect(resolvePackagedExecutable(target)).toBe(executable);
      expect(resolvePackagedResources(target)).toBe(resources);
    },
  );

  it.each([
    ["linux", "arm64"],
    ["win32", "arm64"],
    ["darwin", "x64"],
    ["freebsd", "x64"],
  ])(
    "rejects the unsupported %s-%s host before packaging",
    (platform, architecture) => {
      expect(() => resolveDirectoryTarget(platform, architecture)).toThrow(
        /Unsupported directory package platform|Directory package requires/u,
      );
    },
  );
});
