import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { JSON_SCHEMA, load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(import.meta.dirname, "../../../.github/workflows/ci.yml"),
  "utf8",
);
interface WorkflowStep {
  readonly name: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface WorkflowJob {
  readonly "runs-on"?: string | readonly string[];
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly strategy?: {
    readonly matrix?: { readonly os?: readonly string[] };
  };
  readonly steps: readonly WorkflowStep[];
}

const parsed = load(workflow, { schema: JSON_SCHEMA }) as {
  readonly permissions: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
};
const checks = parsed.jobs["checks"];
if (checks === undefined) throw new Error("CI checks job is missing");

/**
 * Finds one required CI step by its stable display name.
 *
 * @param name The exact workflow step name.
 * @returns The parsed workflow step.
 * @throws {Error} When the required step is missing.
 */
function requireStep(name: string): WorkflowStep {
  const step = checks.steps.find((candidate) => candidate.name === name);
  if (step === undefined) throw new Error(`CI step is missing: ${name}`);
  return step;
}

const pinnedActions = Object.freeze({
  checkout: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
  setupNode: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  uploadArtifact:
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
});

describe("CI workflow policy", () => {
  it("keeps the accepted fixed three-platform runner matrix", () => {
    expect(checks.strategy?.matrix?.os).toEqual([
      "ubuntu-26.04",
      "windows-2025",
      "macos-26",
    ]);
    expect(workflow).not.toMatch(/(?:ubuntu|windows|macos)-latest/u);
    expect(requireStep("Verify runner platform and architecture").run).toBe(
      "node apps/desktop/scripts/verify-ci-platform.mjs",
    );
    expect(
      checks.steps.findIndex(
        ({ name }) => name === "Verify runner platform and architecture",
      ),
    ).toBeLessThan(
      checks.steps.findIndex(({ name }) => name === "Install dependencies"),
    );
  });

  it("uses the fixed Node and Corepack pnpm versions", () => {
    expect(workflow).toContain("node-version: 24.18.0");
    expect(workflow).toContain("corepack pnpm@11.24.0 --version");
    expect(workflow).toContain(
      "corepack pnpm@11.24.0 install --frozen-lockfile",
    );
    expect(workflow).not.toMatch(/^\s*run:\s+pnpm(?:\s|$)/mu);
  });

  it("does not ask setup-node to invoke a missing global pnpm shim", () => {
    expect(workflow).not.toMatch(/^\s*cache:\s*pnpm\s*$/mu);
  });

  it("pins every third-party Action to an immutable full commit", () => {
    const actionSteps = Object.values(parsed.jobs).flatMap(({ steps }) =>
      steps.filter(
        (step): step is WorkflowStep & { readonly uses: string } =>
          step.uses !== undefined,
      ),
    );

    expect(actionSteps.map(({ uses }) => uses)).toEqual([
      pinnedActions.checkout,
      pinnedActions.setupNode,
      pinnedActions.uploadArtifact,
      pinnedActions.uploadArtifact,
      pinnedActions.checkout,
      pinnedActions.setupNode,
    ]);
    for (const { uses } of actionSteps) {
      expect(uses).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/u);
    }
    expect(workflow).not.toMatch(/uses:\s+[^\s#]+@v\d+/u);
  });

  it("builds one platform-native Electron directory on every matrix host", () => {
    expect(requireStep("Build platform-native directory artifact").run).toBe(
      "corepack pnpm@11.24.0 --filter @ztools/desktop run package:directory",
    );
    expect(requireStep("Smoke platform-native directory artifact").run).toBe(
      "corepack pnpm@11.24.0 --filter @ztools/desktop run smoke:directory",
    );
    const upload = requireStep("Upload directory artifact smoke diagnostics");
    expect(upload).toMatchObject({
      if: "failure()",
      uses: pinnedActions.uploadArtifact,
      with: {
        path: "artifacts/desktop-directory-smoke/diagnostics.json",
        "if-no-files-found": "ignore",
        "retention-days": 7,
      },
    });
    expect(parsed.permissions).toEqual({ contents: "read" });
  });

  it("keeps Linux display commands out of Windows and macOS steps", () => {
    expect(requireStep("Electron E2E (Linux virtual display)")).toMatchObject({
      if: "runner.os == 'Linux'",
      run: "xvfb-run --auto-servernum corepack pnpm@11.24.0 run test:e2e",
    });
    expect(requireStep("Electron E2E")).toMatchObject({
      if: "runner.os != 'Linux'",
      run: "corepack pnpm@11.24.0 run test:e2e",
    });
    expect(
      requireStep(
        "Smoke platform-native directory artifact (Linux virtual display)",
      ),
    ).toMatchObject({
      if: "runner.os == 'Linux'",
    });
    expect(
      requireStep("Smoke platform-native directory artifact"),
    ).toMatchObject({
      if: "runner.os != 'Linux'",
    });
  });

  it("runs the real Wayland smoke only on an explicitly enabled desktop runner", () => {
    const wayland = parsed.jobs["ubuntu-wayland-smoke"];
    if (wayland === undefined) throw new Error("Wayland smoke job is missing");

    expect(wayland).toMatchObject({
      "runs-on": ["self-hosted", "linux", "x64", "ztools-ubuntu-26.04-wayland"],
      needs: "checks",
      if: "${{ vars.ZTOOLS_WAYLAND_RUNNER == 'true' }}",
    });
    expect(
      wayland.steps.find(({ name }) =>
        name.includes("Verify runner platform and architecture"),
      )?.run,
    ).toBe("node apps/desktop/scripts/verify-ci-platform.mjs");
  });
});
