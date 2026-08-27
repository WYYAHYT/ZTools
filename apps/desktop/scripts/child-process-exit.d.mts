import type { ChildProcess } from "node:child_process";

export interface ChildProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
}

export interface ChildProcessTimers {
  readonly setTimeout: typeof setTimeout;
  readonly clearTimeout: typeof clearTimeout;
}

/**
 * Waits for an owned child process to exit, terminating it after a fixed deadline.
 *
 * @param child The child process whose final exit is required before cleanup.
 * @param timeoutMs The positive finite maximum duration.
 * @param terminationSignal The signal requested after the deadline.
 * @param timers The optional injectable timer ownership boundary.
 * @returns The final code, signal and timeout state.
 * @throws {RangeError} When the timeout is invalid.
 * @throws {Error} When spawning or termination fails.
 */
export function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
  terminationSignal?: NodeJS.Signals,
  timers?: ChildProcessTimers,
): Promise<ChildProcessExit>;
