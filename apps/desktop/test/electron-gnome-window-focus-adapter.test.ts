import { describe, expect, it, vi } from "vitest";

import {
  readyHostVisibilitySnapshot,
  unavailableHostVisibilitySnapshot,
  type WindowFocusCapability,
} from "@ztools/platform-capabilities";
import { createElectronGnomeWindowFocusAdapter } from "../src/main/electron-gnome-window-focus-adapter.js";
import type { GnomePreviousFocusAdapter } from "../src/main/gnome-previous-focus-adapter.js";

const readyFocus = {
  capabilityId: "host.previous-app-focus",
  capabilityVersion: 1,
  implementation: { state: "supported" },
  dependency: { state: "ready" },
  systemAuthorization: { state: "not-required" },
  health: { state: "ready" },
  permission: { state: "not-applicable" },
} as const;

function launcher(
  effectOutcome: "committed" | "unknown",
): WindowFocusCapability {
  return {
    getVisibilitySnapshot: () => readyHostVisibilitySnapshot,
    getFocusSnapshot: () => readyFocus,
    setVisibility: () =>
      Promise.resolve({
        visibility: effectOutcome === "committed" ? "hidden" : "visible",
        effectOutcome,
        capability:
          effectOutcome === "committed"
            ? readyHostVisibilitySnapshot
            : unavailableHostVisibilitySnapshot,
      }),
    hideAndRestorePrevious: () => {
      throw new Error("composite must use the visibility-only operation");
    },
  };
}

describe("Electron GNOME Window Focus Adapter", () => {
  it("restores focus only after an observed committed hide", async () => {
    const restore = vi.fn(() =>
      Promise.resolve({
        focusResult: "restored" as const,
        capability: readyFocus,
      }),
    );
    const focus: GnomePreviousFocusAdapter = {
      getSnapshot: () => readyFocus,
      restore,
      revoke: () => undefined,
    };
    const adapter = createElectronGnomeWindowFocusAdapter(
      launcher("committed"),
      focus,
      () => 1_000,
    );

    await expect(adapter.hideAndRestorePrevious()).resolves.toMatchObject({
      effectOutcome: "committed",
      focusResult: "restored",
    });
    expect(restore).toHaveBeenCalledWith(1_500);
  });

  it("does not request focus when hide outcome is unknown", async () => {
    const restore = vi.fn();
    const focus: GnomePreviousFocusAdapter = {
      getSnapshot: () => readyFocus,
      restore,
      revoke: () => undefined,
    };
    const adapter = createElectronGnomeWindowFocusAdapter(
      launcher("unknown"),
      focus,
    );

    await expect(adapter.hideAndRestorePrevious()).resolves.toMatchObject({
      effectOutcome: "unknown",
      focusResult: "not-attempted",
    });
    expect(restore).not.toHaveBeenCalled();
  });

  it("refreshes extension dependency after a committed launcher recall", async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const focus: GnomePreviousFocusAdapter = {
      getSnapshot: () => readyFocus,
      restore: () =>
        Promise.resolve({ focusResult: "restored", capability: readyFocus }),
      revoke: () => undefined,
    };
    const adapter = createElectronGnomeWindowFocusAdapter(
      launcher("committed"),
      focus,
      Date.now,
      refresh,
    );

    await expect(adapter.setVisibility("show")).resolves.toMatchObject({
      effectOutcome: "committed",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
