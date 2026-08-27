import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("platform-native directory package policy", () => {
  it("builds from a minimal runtime allowlist and verifies native output", async () => {
    const source = await readFile(
      new URL("../scripts/package-directory.mjs", import.meta.url),
      "utf8",
    );
    const manifest = await readFile(
      new URL("../package.json", import.meta.url),
      "utf8",
    );

    expect(manifest).toContain('"@electron/packager": "20.3.0"');
    expect(manifest).toContain('"package:directory"');
    expect(source).toContain('electronVersion = "44.0.0"');
    expect(source).toContain('main: "dist/main/main.js"');
    expect(source).toContain("asar: true");
    expect(source).toContain("prune: false");
    expect(source).toContain('stat(join(resourcesDirectory, "app.asar"))');
    expect(source).not.toContain("cp(desktopDirectory");
    expect(source).not.toContain('node_modules"');
    expect(
      source.indexOf("resolveDirectoryTarget(process.platform"),
    ).toBeLessThan(source.indexOf("await mkdtemp("));
  });

  it("launches the packaged executable with isolated data and verifies Renderer isolation", async () => {
    const source = await readFile(
      new URL("../scripts/smoke-directory-package.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'mkdtemp(\n  join(tmpdir(), "ztools-directory-smoke-")',
    );
    expect(source).toContain("`--user-data-dir=${isolatedUserData}`");
    expect(source).toContain('ZTOOLS_GATE1_SMOKE: "1"');
    expect(source).toContain('evidence.processType !== "undefined"');
    expect(source).toContain('evidence.requireType !== "undefined"');
    expect(source).toContain("unexpectedErrors.length > 0");
    expect(source).toContain('status: "failed"');
    expect(source).toContain("diagnosticPath,");
    expect(source).toContain("JSON.stringify(diagnostics, null, 2)");
    expect(source).not.toContain("JSON.stringify(stdout");
    expect(source).not.toContain("JSON.stringify(stderr");
    expect(source).not.toContain("invalid: ${stdout}");
    expect(source).not.toContain("diagnostics: ${stderr}");
    expect(source).toContain('event: "ztools-directory-package-smoke-failed"');
    expect(source).toContain("process.exitCode = 1");
    expect(source).not.toContain("throw error;");
    expect(source).toContain(
      "rm(isolatedUserData, { recursive: true, force: true })",
    );
    expect(
      source.indexOf("resolveDirectoryTarget(process.platform"),
    ).toBeLessThan(source.indexOf("await mkdtemp("));
  });
});
