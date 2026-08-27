import { describe, expect, it, vi } from "vitest";

import { createGnomePreviousFocusAdapter } from "../src/main/gnome-previous-focus-adapter.js";
import type { GnomePreviousFocusClient } from "../src/main/gnome-previous-focus-protocol.js";

/**
 * Creates a controlled protocol client for Capability mapping tests.
 *
 * @param result The restore result returned by the fake protocol client.
 * @returns A protocol client with observable restore and revoke methods.
 */
function client(
  result: Awaited<ReturnType<GnomePreviousFocusClient["restore"]>>,
): GnomePreviousFocusClient & {
  readonly restore: ReturnType<typeof vi.fn>;
  readonly revoke: ReturnType<typeof vi.fn>;
} {
  return {
    restore: vi.fn(() => Promise.resolve(result)),
    revoke: vi.fn(),
  };
}

describe("GNOME Previous Focus Adapter", () => {
  it.each([
    ["missing", "focus.extensionMissing"],
    ["disabled", "focus.extensionDisabled"],
    ["incompatible", "focus.extensionIncompatible"],
  ] as const)(
    "reports the %s extension dependency without calling transport",
    async (state, reasonCode) => {
      const protocolClient = client({
        ok: true,
        focusResult: "restored",
      });
      const adapter = createGnomePreviousFocusAdapter(
        () => ({ state }),
        protocolClient,
      );

      expect(adapter.getSnapshot()).toMatchObject({
        implementation: { state: "supported" },
        dependency: { state, reasonCode },
        health: { state: "unavailable" },
      });
      await expect(adapter.restore(2_000)).resolves.toMatchObject({
        focusResult: "unavailable",
        capability: { dependency: { state } },
      });
      expect(protocolClient.restore).not.toHaveBeenCalled();
    },
  );

  it("reports ready after a successful compatible extension restore", async () => {
    const protocolClient = client({ ok: true, focusResult: "restored" });
    const adapter = createGnomePreviousFocusAdapter(
      () => ({ state: "ready" }),
      protocolClient,
    );

    await expect(adapter.restore(2_000)).resolves.toMatchObject({
      focusResult: "restored",
      capability: {
        dependency: { state: "ready" },
        health: { state: "ready" },
      },
    });
  });

  it("reports degraded for a valid call that cannot restore focus", async () => {
    const protocolClient = client({
      ok: true,
      focusResult: "unavailable",
      reasonCode: "focus.noPreviousCandidate",
    });
    const adapter = createGnomePreviousFocusAdapter(
      () => ({ state: "ready" }),
      protocolClient,
    );

    await expect(adapter.restore(2_000)).resolves.toMatchObject({
      focusResult: "unavailable",
      capability: {
        health: {
          state: "degraded",
          reasonCode: "focus.noPreviousCandidate",
        },
      },
    });
  });

  it("keeps implementation supported when the protocol session fails", async () => {
    const protocolClient = client({
      ok: false,
      focusResult: "unavailable",
      reasonCode: "focus.extensionEpochChanged",
    });
    const adapter = createGnomePreviousFocusAdapter(
      () => ({ state: "ready" }),
      protocolClient,
    );

    await expect(adapter.restore(2_000)).resolves.toMatchObject({
      focusResult: "unavailable",
      capability: {
        implementation: { state: "supported" },
        dependency: { state: "ready" },
        health: {
          state: "unavailable",
          reasonCode: "focus.extensionEpochChanged",
        },
      },
    });
  });

  it("revokes the protocol client and exposes unavailable health", () => {
    const protocolClient = client({ ok: true, focusResult: "restored" });
    const adapter = createGnomePreviousFocusAdapter(
      () => ({ state: "ready" }),
      protocolClient,
    );

    adapter.revoke();

    expect(protocolClient.revoke).toHaveBeenCalledOnce();
    expect(adapter.getSnapshot().health).toMatchObject({
      state: "unavailable",
      reasonCode: "focus.sessionRevoked",
    });
  });
});
