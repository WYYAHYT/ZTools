import { execFile } from "node:child_process";

import type {
  GnomePreviousFocusRequest,
  GnomePreviousFocusTransport,
} from "./gnome-previous-focus-protocol.js";

const GDBUS_EXECUTABLE = "/usr/bin/gdbus";
const BUS_NAME = "com.ztools.ZToolsPreviousFocus";
const OBJECT_PATH = "/com/ztools/ZToolsPreviousFocus";
const INTERFACE_NAME = "com.ztools.ZToolsPreviousFocus";
const METHOD_NAME = `${INTERFACE_NAME}.RestorePreviousFocus`;
const MAX_OUTPUT_BYTES = 4_096;

export interface FixedProcessResult {
  readonly stdout: string;
}

export interface FixedProcessRunner {
  /**
   * Executes one fixed executable without involving a shell.
   *
   * @param executable The absolute executable path selected by the Adapter.
   * @param arguments_ The fixed command arguments and one bounded protocol payload.
   * @param timeoutMs The hard process deadline in milliseconds.
   * @param maxOutputBytes The maximum accepted stdout/stderr buffer size.
   * @returns The bounded stdout after a successful exit.
   */
  run(
    executable: string,
    arguments_: readonly string[],
    timeoutMs: number,
    maxOutputBytes: number,
  ): Promise<FixedProcessResult>;
}

export interface GnomeDbusTransport extends GnomePreviousFocusTransport {
  /**
   * Checks whether the fixed extension object and method are currently exported.
   *
   * @returns True only when introspection proves the expected v1 interface.
   */
  probe(): Promise<boolean>;
}

/**
 * Runs the fixed GDBus executable with no shell, bounded output and forced termination.
 *
 * @param executable The absolute executable path controlled by this module.
 * @param arguments_ The fixed argument vector passed directly to execve.
 * @param timeoutMs The hard child-process timeout.
 * @param maxOutputBytes The stdout/stderr buffer limit.
 * @returns The successful bounded stdout.
 */
function runFixedProcess(
  executable: string,
  arguments_: readonly string[],
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<FixedProcessResult> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      {
        encoding: "utf8",
        maxBuffer: maxOutputBytes,
        shell: false,
        timeout: timeoutMs,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error("fixed platform process failed", { cause: error }));
          return;
        }
        resolve({ stdout });
      },
    );
  });
}

const defaultRunner: FixedProcessRunner = Object.freeze({
  run: runFixedProcess,
});

/**
 * Extracts the extension's bounded JSON string from GDBus tuple output.
 *
 * @param stdout The untrusted stdout emitted by GDBus.
 * @returns The parsed unknown response for strict validation by the protocol client.
 * @throws {Error} When output is oversized or not the exact single-string tuple shape.
 */
function parseGdbusStringTuple(stdout: string): unknown {
  if (Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
    throw new Error("GNOME extension response exceeded output limit");
  }
  const match = /^\('([^'\r\n]{1,2048})',\)\r?\n?$/u.exec(stdout);
  if (match?.[1] === undefined) {
    throw new Error("invalid GNOME extension GDBus response");
  }
  return JSON.parse(match[1]);
}

/**
 * Creates the fixed-method Session Bus transport for the GNOME extension.
 *
 * @param runner The no-shell bounded process runner, injectable for contract tests.
 * @param now Supplies Unix milliseconds for deadline-derived process timeouts.
 * @returns A transport that cannot select a bus, object, method or target window dynamically.
 */
export function createGnomeDbusTransport(
  runner: FixedProcessRunner = defaultRunner,
  now: () => number = Date.now,
): GnomeDbusTransport {
  return Object.freeze({
    async probe(): Promise<boolean> {
      try {
        const result = await runner.run(
          GDBUS_EXECUTABLE,
          [
            "introspect",
            "--session",
            "--dest",
            BUS_NAME,
            "--object-path",
            OBJECT_PATH,
          ],
          500,
          MAX_OUTPUT_BYTES,
        );
        return (
          result.stdout.includes(`interface ${INTERFACE_NAME}`) &&
          result.stdout.includes("RestorePreviousFocus")
        );
      } catch {
        return false;
      }
    },
    async restore(request: GnomePreviousFocusRequest): Promise<unknown> {
      const remainingMs = request.deadlineUnixMs - now();
      if (remainingMs <= 0) {
        throw new Error("GNOME previous-focus deadline expired");
      }
      const encodedRequest = JSON.stringify(request);
      if (Buffer.byteLength(encodedRequest, "utf8") > 2_048) {
        throw new Error("GNOME previous-focus request exceeded input limit");
      }
      const result = await runner.run(
        GDBUS_EXECUTABLE,
        [
          "call",
          "--session",
          "--dest",
          BUS_NAME,
          "--object-path",
          OBJECT_PATH,
          "--method",
          METHOD_NAME,
          "--timeout",
          "1",
          encodedRequest,
        ],
        Math.min(1_000, remainingMs),
        MAX_OUTPUT_BYTES,
      );
      return parseGdbusStringTuple(result.stdout);
    },
  });
}
