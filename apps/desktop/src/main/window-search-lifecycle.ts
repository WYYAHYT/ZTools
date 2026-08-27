import type { ConnectionContext } from "@ztools/contract-kernel";

export interface ConnectionSearchRevoker {
  /**
   * Revokes search work owned by one trusted Renderer connection.
   *
   * @param context The connection whose search resources must be released.
   * @returns Nothing after all connection-owned search work is cancelled.
   */
  revoke(context: ConnectionContext): void;
}

export interface WindowSearchLifecycle {
  /**
   * Handles Electron's observed Host window hide event.
   *
   * @returns Nothing after the currently visible connection's search is revoked.
   */
  onWindowHidden(): void;
}

/**
 * Binds observed Electron window hiding to connection-owned search cleanup.
 *
 * @param getCurrentContext Resolves the Renderer connection visible at event time.
 * @param searchRevoker Releases only that connection's search resources.
 * @returns A lifecycle handler safe to register on BrowserWindow's hide event.
 */
export function createWindowSearchLifecycle(
  getCurrentContext: () => ConnectionContext | undefined,
  searchRevoker: ConnectionSearchRevoker,
): WindowSearchLifecycle {
  return Object.freeze({
    onWindowHidden(): void {
      const context = getCurrentContext();
      if (context !== undefined) {
        // The native hide event is the authoritative point where visible search work ends.
        searchRevoker.revoke(context);
      }
    },
  });
}
