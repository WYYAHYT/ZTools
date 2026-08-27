export interface BootstrapSnapshot {
  readonly applicationVersion: string;
  readonly protocolVersion: 1;
  readonly status: "ready";
}

export interface BootstrapQuery {
  /**
   * Returns the safe, immutable state required to render the initial Host UI.
   *
   * @param signal Cancels the query when its trusted connection is revoked or deadline expires.
   * @returns The current bootstrap snapshot.
   * @throws {DOMException} When the query is already cancelled.
   */
  getBootstrap(signal: AbortSignal): Promise<BootstrapSnapshot>;
}

/**
 * Creates the minimal Gate 1 bootstrap query without introducing infrastructure dependencies.
 *
 * @param applicationVersion The version embedded by the trusted composition root.
 * @returns A bootstrap query for the Host Renderer use case.
 */
export function createBootstrapQuery(
  applicationVersion: string,
): BootstrapQuery {
  return Object.freeze({
    getBootstrap(signal: AbortSignal): Promise<BootstrapSnapshot> {
      // Reject before producing a snapshot when the owning connection has already ended.
      signal.throwIfAborted();
      return Promise.resolve(
        Object.freeze({
          applicationVersion,
          protocolVersion: 1,
          status: "ready",
        }),
      );
    },
  });
}
