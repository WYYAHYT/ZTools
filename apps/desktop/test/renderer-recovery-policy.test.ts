import { describe, expect, it } from "vitest";

import {
  MAX_RENDERER_RECOVERY_ATTEMPTS,
  createRendererRecoveryPolicy,
} from "../src/main/renderer-recovery-policy.js";

describe("Renderer recovery policy", () => {
  it("grants only the fixed per-window recovery budget", () => {
    const policy = createRendererRecoveryPolicy();

    expect(policy.next()).toEqual({ action: "recover", attempt: 1 });
    expect(policy.next()).toEqual({
      action: "recover",
      attempt: MAX_RENDERER_RECOVERY_ATTEMPTS,
    });
    expect(policy.next()).toEqual({
      action: "terminate",
      attempts: MAX_RENDERER_RECOVERY_ATTEMPTS,
    });
    expect(policy.next()).toEqual({
      action: "terminate",
      attempts: MAX_RENDERER_RECOVERY_ATTEMPTS,
    });
  });

  it("supports a zero-recovery fail-closed policy", () => {
    const policy = createRendererRecoveryPolicy(0);

    expect(policy.next()).toEqual({ action: "terminate", attempts: 0 });
    expect(policy.attempts).toBe(0);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid maximum %s",
    (maximumAttempts) => {
      expect(() => createRendererRecoveryPolicy(maximumAttempts)).toThrow(
        RangeError,
      );
    },
  );
});
