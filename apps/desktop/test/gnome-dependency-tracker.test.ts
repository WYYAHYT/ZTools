import { describe, expect, it, vi } from "vitest";

import { createGnomeDependencyTracker } from "../src/main/gnome-dependency-tracker.js";

const request = {
  protocolVersion: 1,
  sessionNonce: "host_session_nonce_1234567890",
  sequence: 1,
  deadlineUnixMs: 2_000,
} as const;

describe("GNOME dependency tracker", () => {
  it("observes extension appearance without polling", async () => {
    let ready = false;
    const probe = vi.fn(() => Promise.resolve(ready));
    const tracker = createGnomeDependencyTracker({
      probe,
      restore: () => Promise.resolve({}),
    });

    expect(tracker.getState()).toEqual({ state: "missing" });
    await tracker.refresh();
    ready = true;
    await tracker.refresh();
    expect(tracker.getState()).toEqual({ state: "ready" });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("marks disappearance after a call failure and readiness after recovery", async () => {
    let fails = true;
    const tracker = createGnomeDependencyTracker({
      probe: () => Promise.resolve(true),
      restore: () =>
        fails
          ? Promise.reject(new Error("service owner disappeared"))
          : Promise.resolve({ result: "restored" }),
    });
    await tracker.refresh();
    await expect(tracker.transport.restore(request)).rejects.toThrow(
      "service owner disappeared",
    );
    expect(tracker.getState()).toEqual({ state: "missing" });
    fails = false;
    await expect(tracker.transport.restore(request)).resolves.toEqual({
      result: "restored",
    });
    expect(tracker.getState()).toEqual({ state: "ready" });
  });

  it("deduplicates concurrent probes", async () => {
    let resolveProbe: ((ready: boolean) => void) | undefined;
    const probe = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const tracker = createGnomeDependencyTracker({
      probe,
      restore: () => Promise.resolve({}),
    });
    const first = tracker.refresh();
    const second = tracker.refresh();
    resolveProbe?.(true);
    await Promise.all([first, second]);
    expect(probe).toHaveBeenCalledOnce();
  });
});
