import { describe, expect, it } from "vitest";

import {
  createElectronLauncherAdapter,
  type ElectronLauncherWindow,
} from "../src/main/electron-launcher-adapter.js";

/**
 * Creates a deterministic Electron window double with observable transition calls.
 *
 * @param initiallyVisible The initial Electron visibility observation.
 * @param appliesTransitions Whether show and hide update the observed state.
 * @returns The window double and call counters used by Adapter tests.
 */
function createWindow(
  initiallyVisible: boolean,
  appliesTransitions = true,
  initiallyMinimized = false,
): ElectronLauncherWindow & {
  readonly calls: {
    show: number;
    hide: number;
    restore: number;
    focus: number;
  };
} {
  let visible = initiallyVisible;
  let minimized = initiallyMinimized;
  const calls = { show: 0, hide: 0, restore: 0, focus: 0 };
  return {
    calls,
    isDestroyed: () => false,
    isVisible: () => visible,
    isMinimized: () => minimized,
    show: () => {
      calls.show += 1;
      if (appliesTransitions) {
        visible = true;
      }
    },
    restore: () => {
      calls.restore += 1;
      minimized = false;
    },
    focus: () => {
      calls.focus += 1;
    },
    hide: () => {
      calls.hide += 1;
      if (appliesTransitions) {
        visible = false;
      }
    },
  };
}

describe("Electron Launcher Adapter", () => {
  it("reports unavailable health when no live Host window exists", async () => {
    const adapter = createElectronLauncherAdapter(() => undefined);

    expect(adapter.getVisibilitySnapshot()).toMatchObject({
      implementation: { state: "supported" },
      health: {
        state: "unavailable",
        reasonCode: "visibility.windowUnavailable",
      },
    });
    await expect(adapter.setVisibility("show")).resolves.toMatchObject({
      effectOutcome: "not-committed",
      capability: { health: { state: "unavailable" } },
    });
    await expect(adapter.hideAndRestorePrevious()).resolves.toMatchObject({
      effectOutcome: "not-started",
      focusResult: "unavailable",
      visibilityCapability: { health: { state: "unavailable" } },
    });
  });

  it("treats a destroyed Host window as unavailable", () => {
    const adapter = createElectronLauncherAdapter(() => ({
      isDestroyed: () => true,
      isVisible: () => true,
      isMinimized: () => false,
      show: () => undefined,
      restore: () => undefined,
      focus: () => undefined,
      hide: () => undefined,
    }));

    expect(adapter.getVisibilitySnapshot().health.state).toBe("unavailable");
  });

  it("commits show and hide only after observing the requested state", async () => {
    const window = createWindow(false);
    const adapter = createElectronLauncherAdapter(() => window);

    await expect(adapter.setVisibility("show")).resolves.toMatchObject({
      visibility: "visible",
      effectOutcome: "committed",
    });
    await expect(adapter.setVisibility("hide")).resolves.toMatchObject({
      visibility: "hidden",
      effectOutcome: "committed",
    });
    expect(window.calls).toEqual({
      show: 1,
      hide: 1,
      restore: 0,
      focus: 1,
    });
  });

  it("restores a minimized launcher before showing and focusing it", async () => {
    const window = createWindow(false, true, true);
    const adapter = createElectronLauncherAdapter(() => window);

    await expect(adapter.setVisibility("show")).resolves.toMatchObject({
      visibility: "visible",
      effectOutcome: "committed",
    });
    expect(window.calls).toEqual({
      show: 1,
      hide: 0,
      restore: 1,
      focus: 1,
    });
  });

  it("reports unknown when Electron does not reach the requested state", async () => {
    const window = createWindow(true, false);
    const adapter = createElectronLauncherAdapter(() => window);

    await expect(adapter.setVisibility("hide")).resolves.toMatchObject({
      visibility: "visible",
      effectOutcome: "unknown",
    });
    await expect(adapter.hideAndRestorePrevious()).resolves.toMatchObject({
      effectOutcome: "unknown",
      focusResult: "unavailable",
    });
  });

  it("keeps previous-focus explicitly unavailable after a committed hide", async () => {
    const window = createWindow(true);
    const adapter = createElectronLauncherAdapter(() => window);

    await expect(adapter.hideAndRestorePrevious()).resolves.toMatchObject({
      effectOutcome: "committed",
      focusResult: "unavailable",
      visibilityCapability: { health: { state: "ready" } },
      focusCapability: {
        implementation: { state: "unsupported" },
        health: { state: "unavailable" },
      },
    });
  });
});
