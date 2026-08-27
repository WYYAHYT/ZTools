import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Wayland smoke isolation policy", () => {
  it("uses and removes a unique temporary Electron user-data directory", async () => {
    const source = await readFile(
      new URL("../smoke-test.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'mkdtemp(\n  resolve(tmpdir(), "ztools-wayland-smoke-")',
    );
    expect(source).toContain("`--user-data-dir=${isolatedUserData}`");
    expect(source).toContain(
      "rm(isolatedUserData, { recursive: true, force: true })",
    );
  });
});
