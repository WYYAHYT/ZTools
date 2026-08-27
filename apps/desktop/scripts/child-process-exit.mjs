import { clearTimeout, setTimeout } from "node:timers";

/**
 * Waits for a child process to exit and requests termination on a fixed deadline.
 *
 * @param {import("node:child_process").ChildProcess} child The owned process to observe.
 * @param {number} timeoutMs The positive finite maximum duration.
 * @param {NodeJS.Signals} terminationSignal The signal requested after the deadline.
 * @param {{setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout}} timers The injectable timer ownership boundary.
 * @returns {Promise<{code: number|null, signal: NodeJS.Signals|null, timedOut: boolean}>} The final process exit and timeout state.
 * @throws {RangeError} When the timeout is not a positive finite number.
 * @throws {Error} When the process cannot be spawned or cannot be terminated.
 */
export function waitForChildExit(
  child,
  timeoutMs,
  terminationSignal = "SIGKILL",
  timers = { setTimeout, clearTimeout },
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Child process timeout must be a positive number");
  }
  return new Promise((resolve, reject) => {
    let timer;
    let timedOut = false;
    let settled = false;

    /**
     * Removes process listeners and the outstanding timeout after one terminal event.
     *
     * @returns {void} Nothing after owned resources are released.
     */
    const cleanup = () => {
      if (timer !== undefined) timers.clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
    };

    /**
     * Rejects a process that failed before a reliable exit status existed.
     *
     * @param {Error} error The bounded child process startup error.
     * @returns {void} Nothing after the observer settles.
     */
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    /**
     * Resolves only after the operating system confirms the child has exited.
     *
     * @param {number|null} code The child exit code.
     * @param {NodeJS.Signals|null} signal The child exit signal.
     * @returns {void} Nothing after the observer settles.
     */
    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Object.freeze({ code, signal, timedOut }));
    };

    child.once("error", onError);
    child.once("exit", onExit);
    timer = timers.setTimeout(() => {
      if (settled) return;
      timedOut = true;
      // Do not release the profile until the operating system confirms process exit.
      if (!child.kill(terminationSignal)) {
        settled = true;
        cleanup();
        reject(new Error("Child process termination request failed"));
      }
    }, timeoutMs);
  });
}
