export const MAX_RENDERER_RECOVERY_ATTEMPTS = 2;

export interface RendererRecoveryPolicy {
  readonly attempts: number;
  next():
    | { readonly action: "recover"; readonly attempt: number }
    | { readonly action: "terminate"; readonly attempts: number };
}

/**
 * Creates a per-window recovery budget that prevents an unbounded Renderer crash loop.
 *
 * @param maximumAttempts The maximum number of trusted local document reloads allowed.
 * @returns A policy that grants bounded recovery attempts and then requires termination.
 * @throws {RangeError} When the configured maximum is not a non-negative integer.
 */
export function createRendererRecoveryPolicy(
  maximumAttempts = MAX_RENDERER_RECOVERY_ATTEMPTS,
): RendererRecoveryPolicy {
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 0) {
    throw new RangeError(
      "Renderer recovery maximum must be a non-negative integer",
    );
  }
  let attempts = 0;
  return Object.freeze({
    get attempts(): number {
      return attempts;
    },
    next():
      | { readonly action: "recover"; readonly attempt: number }
      | { readonly action: "terminate"; readonly attempts: number } {
      if (attempts >= maximumAttempts) {
        return Object.freeze({ action: "terminate", attempts });
      }
      attempts += 1;
      return Object.freeze({ action: "recover", attempt: attempts });
    },
  });
}
