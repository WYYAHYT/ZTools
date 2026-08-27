import type {
  HideAndRestoreResult,
  SetVisibilityResult,
  WindowCapabilitySnapshot,
  WindowFocusCapability,
} from "@ztools/platform-capabilities";

import type { GnomePreviousFocusAdapter } from "./gnome-previous-focus-adapter.js";

/**
 * Composes Electron launcher visibility with the independent GNOME focus capability.
 *
 * @param launcher The Electron-owned launcher visibility Adapter.
 * @param focus The GNOME extension-backed Previous Focus Adapter.
 * @param now Supplies Unix milliseconds for a bounded focus deadline.
 * @param refreshDependency Starts an event-driven extension dependency refresh.
 * @returns A Window Capability that never lets focus failure overwrite a committed hide.
 */
export function createElectronGnomeWindowFocusAdapter(
  launcher: WindowFocusCapability,
  focus: GnomePreviousFocusAdapter,
  now: () => number = Date.now,
  refreshDependency: () => Promise<void> = () => Promise.resolve(),
): WindowFocusCapability {
  return Object.freeze({
    getVisibilitySnapshot(): WindowCapabilitySnapshot<"host.launcher-visibility"> {
      return launcher.getVisibilitySnapshot();
    },
    getFocusSnapshot(): WindowCapabilitySnapshot<"host.previous-app-focus"> {
      return focus.getSnapshot();
    },
    async setVisibility(
      visibility: "show" | "hide",
    ): Promise<SetVisibilityResult> {
      const result = await launcher.setVisibility(visibility);
      if (visibility === "show" && result.effectOutcome === "committed") {
        // Refresh in the background so launcher recall latency never waits for D-Bus.
        void refreshDependency();
      }
      return result;
    },
    async hideAndRestorePrevious(): Promise<HideAndRestoreResult> {
      const visibility = await launcher.setVisibility("hide");
      if (visibility.effectOutcome !== "committed") {
        return {
          effectOutcome: visibility.effectOutcome,
          focusResult: "not-attempted",
          visibilityCapability: visibility.capability,
          focusCapability: focus.getSnapshot(),
        };
      }

      // Focus restoration is a separate best-effort effect after hiding is observed.
      const focusOutcome = await focus.restore(now() + 500);
      return {
        effectOutcome: "committed",
        focusResult: focusOutcome.focusResult,
        visibilityCapability: visibility.capability,
        focusCapability: focusOutcome.capability,
      };
    },
  });
}
