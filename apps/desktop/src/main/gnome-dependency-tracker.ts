import type { GnomeDbusTransport } from "./gnome-dbus-transport.js";
import type { GnomePreviousFocusDependencyState } from "./gnome-previous-focus-adapter.js";
import type {
  GnomePreviousFocusRequest,
  GnomePreviousFocusTransport,
} from "./gnome-previous-focus-protocol.js";

export interface GnomeDependencyTracker {
  readonly transport: GnomePreviousFocusTransport;

  /**
   * Reads the latest observed extension dependency state.
   *
   * @returns Ready after a successful probe/call, otherwise missing.
   */
  getState(): GnomePreviousFocusDependencyState;

  /**
   * Starts one deduplicated dependency probe without background polling.
   *
   * @returns Nothing after the latest probe updates dependency state.
   */
  refresh(): Promise<void>;
}

/**
 * Tracks extension appearance and disappearance around a fixed D-Bus transport.
 *
 * @param dbusTransport The fixed-method transport with an availability probe.
 * @returns A tracked protocol transport and event-driven dependency refresh API.
 */
export function createGnomeDependencyTracker(
  dbusTransport: GnomeDbusTransport,
): GnomeDependencyTracker {
  let state: GnomePreviousFocusDependencyState = { state: "missing" };
  let probeInProgress: Promise<void> | undefined;

  return Object.freeze({
    transport: Object.freeze({
      async restore(request: GnomePreviousFocusRequest): Promise<unknown> {
        try {
          const response = await dbusTransport.restore(request);
          state = { state: "ready" };
          return response;
        } catch (error) {
          state = { state: "missing" };
          throw error;
        }
      },
    }),
    getState(): GnomePreviousFocusDependencyState {
      return state;
    },
    refresh(): Promise<void> {
      if (probeInProgress !== undefined) return probeInProgress;
      probeInProgress = dbusTransport
        .probe()
        .then((ready): void => {
          state = { state: ready ? "ready" : "missing" };
        })
        .finally((): void => {
          probeInProgress = undefined;
        });
      return probeInProgress;
    },
  });
}
