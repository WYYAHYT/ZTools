import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { waitForChildExit } from "../scripts/child-process-exit.mjs";

class FakeChildProcess extends EventEmitter {
  readonly kill = vi.fn(() => true);
}

describe("bounded child process ownership", () => {
  it("resolves a normal exit without requesting termination", async () => {
    const child = new FakeChildProcess();
    const exit = waitForChildExit(child as never, 1_000);

    child.emit("exit", 0, null);

    await expect(exit).resolves.toEqual({
      code: 0,
      signal: null,
      timedOut: false,
    });
    expect(child.kill).not.toHaveBeenCalled();
    expect(child.listenerCount("exit")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
  });

  it("preserves a nonzero exit for the caller to classify", async () => {
    const child = new FakeChildProcess();
    const exit = waitForChildExit(child as never, 1_000);

    child.emit("exit", 7, null);

    await expect(exit).resolves.toEqual({
      code: 7,
      signal: null,
      timedOut: false,
    });
  });

  it("rejects a spawn error and releases listeners", async () => {
    const child = new FakeChildProcess();
    const exit = waitForChildExit(child as never, 1_000);

    child.emit("error", new Error("spawn unavailable"));

    await expect(exit).rejects.toThrow("spawn unavailable");
    expect(child.listenerCount("exit")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
  });

  it("waits for confirmed exit after requesting timeout termination", async () => {
    const child = new FakeChildProcess();
    let deadline: (() => void) | undefined;
    const clearTimer = vi.fn();
    const exit = waitForChildExit(child as never, 15_000, "SIGKILL", {
      setTimeout: ((callback: () => void) => {
        deadline = callback;
        return 1;
      }) as never,
      clearTimeout: clearTimer as never,
    });

    deadline?.();
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    let settled = false;
    void exit.finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    child.emit("exit", null, "SIGKILL");
    await expect(exit).resolves.toEqual({
      code: null,
      signal: "SIGKILL",
      timedOut: true,
    });
    expect(clearTimer).toHaveBeenCalledOnce();
  });

  it("rejects when the operating system refuses termination", async () => {
    const child = new FakeChildProcess();
    child.kill.mockReturnValue(false);
    let deadline: (() => void) | undefined;
    const exit = waitForChildExit(child as never, 10, "SIGKILL", {
      setTimeout: ((callback: () => void) => {
        deadline = callback;
        return 1;
      }) as never,
      clearTimeout: vi.fn() as never,
    });

    deadline?.();

    await expect(exit).rejects.toThrow("termination request failed");
    expect(child.listenerCount("exit")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
  });
});
