import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("single-instance launcher policy", () => {
  it("recalls through the Launcher Capability without consuming process arguments", async () => {
    const source = await readFile(
      new URL("../src/main/main.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("app.requestSingleInstanceLock()");
    expect(source).toContain('app.on("second-instance", () => {');
    expect(source).toContain('windowFocusAdapter.setVisibility("show")');
    expect(source).toContain("pendingSecondInstanceRecall");
    expect(source).not.toMatch(
      /app\.on\("second-instance",\s*\([^)]*(?:argv|commandLine|workingDirectory)/u,
    );
  });
});
