import { describe, expect, it, vi } from "vitest";

import type { ConnectionContext } from "@ztools/contract-kernel";
import {
  createHostSearchGateway,
  type HostSearchGateway,
} from "@ztools/host-gateway";
import {
  createInMemorySearchProvider,
  createSearchApplication,
} from "@ztools/search-application";
import { createWindowSearchLifecycle } from "../src/main/window-search-lifecycle.js";

/**
 * Creates a trusted connection identity for window lifecycle tests.
 *
 * @param connectionId The stable test connection ID.
 * @returns An active immutable connection context.
 */
function context(connectionId: string): ConnectionContext {
  return Object.freeze({
    connectionId,
    connectionEpoch: 1,
    callerRole: "host-renderer",
    protocolVersion: 1,
    signal: new AbortController().signal,
  });
}

describe("Window search lifecycle", () => {
  it("revokes the connection current when Electron observes hiding", () => {
    const first = context("first");
    const replacement = context("replacement");
    let current: ConnectionContext | undefined = first;
    const revoke = vi.fn();
    const lifecycle = createWindowSearchLifecycle(() => current, { revoke });

    lifecycle.onWindowHidden();
    current = replacement;
    lifecycle.onWindowHidden();

    expect(revoke.mock.calls).toEqual([[first], [replacement]]);
  });

  it("does nothing when no Renderer connection owns search work", () => {
    const revoke = vi.fn();
    const lifecycle = createWindowSearchLifecycle(() => undefined, { revoke });

    lifecycle.onWindowHidden();

    expect(revoke).not.toHaveBeenCalled();
  });

  it("releases real Search Gateway resources for only the hidden connection", () => {
    const hidden = context("hidden");
    const visible = context("visible");
    const searchGateway: HostSearchGateway = createHostSearchGateway(
      createSearchApplication([createInMemorySearchProvider([])]),
    );
    searchGateway.start(
      hidden,
      { sessionId: "hidden-session", query: "" },
      () => undefined,
    );
    searchGateway.start(
      visible,
      { sessionId: "visible-session", query: "" },
      () => undefined,
    );
    const lifecycle = createWindowSearchLifecycle(() => hidden, searchGateway);
    expect(searchGateway.getResourceSnapshot().activeSessionCount).toBe(2);

    lifecycle.onWindowHidden();

    expect(searchGateway.getResourceSnapshot().activeSessionCount).toBe(1);
    expect(
      searchGateway.cancel(visible, { sessionId: "visible-session" }),
    ).toMatchObject({ ok: true });
    expect(searchGateway.getResourceSnapshot().activeSessionCount).toBe(0);
  });
});
