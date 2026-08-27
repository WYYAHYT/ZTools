import {
  type HideAndRestoreResult,
  readyHostVisibilitySnapshot,
  type SetVisibilityResult,
  unavailableHostVisibilitySnapshot,
  unavailablePreviousFocusSnapshot,
  type WindowCapabilitySnapshot,
  type WindowFocusCapability,
} from "@ztools/platform-capabilities";

export interface ElectronLauncherWindow {
  /**
   * Reports whether Electron has permanently destroyed the window.
   *
   * @returns True when no further window operations are valid.
   */
  isDestroyed(): boolean;

  /**
   * Reports the current Electron visibility observation.
   *
   * @returns True when Electron currently considers the window visible.
   */
  isVisible(): boolean;

  /**
   * Reports whether the native launcher is minimized.
   *
   * @returns True when showing should first restore the window.
   */
  isMinimized(): boolean;

  /**
   * Requests that Electron show the Host launcher window.
   *
   * @returns Nothing after Electron accepts the synchronous request.
   */
  show(): void;

  /**
   * Restores a minimized native launcher window.
   *
   * @returns Nothing after Electron accepts the synchronous request.
   */
  restore(): void;

  /**
   * Requests native focus after the launcher becomes visible.
   *
   * @returns Nothing after Electron accepts the synchronous request.
   */
  focus(): void;

  /**
   * Requests that Electron hide the Host launcher window.
   *
   * @returns Nothing after Electron accepts the synchronous request.
   */
  hide(): void;
}

/**
 * Creates the shared Electron launcher visibility Adapter used by platform composition roots.
 *
 * @param getWindow Resolves the current Host window without transferring ownership.
 * @returns A Window Capability Adapter with explicit unavailable previous-focus semantics.
 */
export function createElectronLauncherAdapter(
  getWindow: () => ElectronLauncherWindow | undefined,
): WindowFocusCapability {
  /**
   * Resolves only a live Electron window for a Capability operation.
   *
   * @returns The current live window, or undefined when it cannot accept operations.
   */
  function getLiveWindow(): ElectronLauncherWindow | undefined {
    const window = getWindow();
    return window === undefined || window.isDestroyed() ? undefined : window;
  }

  return Object.freeze({
    getVisibilitySnapshot(): WindowCapabilitySnapshot<"host.launcher-visibility"> {
      return getLiveWindow() === undefined
        ? unavailableHostVisibilitySnapshot
        : readyHostVisibilitySnapshot;
    },
    getFocusSnapshot(): WindowCapabilitySnapshot<"host.previous-app-focus"> {
      return unavailablePreviousFocusSnapshot;
    },
    setVisibility(visibility: "show" | "hide"): Promise<SetVisibilityResult> {
      const window = getLiveWindow();
      if (window === undefined) {
        return Promise.resolve({
          visibility: "hidden",
          effectOutcome: "not-committed",
          capability: unavailableHostVisibilitySnapshot,
        });
      }

      // Observe the Electron window after the transition instead of trusting the request alone.
      if (visibility === "show") {
        if (window.isMinimized()) {
          window.restore();
        }
        window.show();
        window.focus();
      } else {
        window.hide();
      }
      const observed = window.isVisible() ? "visible" : "hidden";
      return Promise.resolve({
        visibility: observed,
        effectOutcome:
          observed === (visibility === "show" ? "visible" : "hidden")
            ? "committed"
            : "unknown",
        capability: readyHostVisibilitySnapshot,
      });
    },
    hideAndRestorePrevious(): Promise<HideAndRestoreResult> {
      const window = getLiveWindow();
      if (window === undefined) {
        return Promise.resolve({
          effectOutcome: "not-started",
          focusResult: "unavailable",
          visibilityCapability: unavailableHostVisibilitySnapshot,
          focusCapability: unavailablePreviousFocusSnapshot,
        });
      }

      // Hiding can commit independently even though previous-app focus has no Adapter yet.
      window.hide();
      return Promise.resolve({
        effectOutcome: window.isVisible() ? "unknown" : "committed",
        focusResult: "unavailable",
        visibilityCapability: readyHostVisibilitySnapshot,
        focusCapability: unavailablePreviousFocusSnapshot,
      });
    },
  });
}
