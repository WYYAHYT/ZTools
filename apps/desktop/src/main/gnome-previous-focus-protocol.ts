export const GNOME_PREVIOUS_FOCUS_PROTOCOL_VERSION = 1 as const;

const responseResults = [
  "restored",
  "no-candidate",
  "candidate-invalid",
  "host-not-foreground",
  "rate-limited",
  "protocol-rejected",
] as const;

export type GnomePreviousFocusResponseResult = (typeof responseResults)[number];

export interface GnomePreviousFocusRequest {
  readonly protocolVersion: 1;
  readonly sessionNonce: string;
  readonly sequence: number;
  readonly deadlineUnixMs: number;
}

export interface GnomePreviousFocusResponse {
  readonly protocolVersion: 1;
  readonly extensionEpoch: string;
  readonly sequence: number;
  readonly result: GnomePreviousFocusResponseResult;
}

export interface GnomePreviousFocusTransport {
  /**
   * Invokes the fixed extension restore method without accepting a target window.
   *
   * @param request The validated, session-bound restore request.
   * @returns The untrusted response received from the platform transport.
   */
  restore(request: GnomePreviousFocusRequest): Promise<unknown>;
}

export type GnomePreviousFocusCallResult =
  | {
      readonly ok: true;
      readonly focusResult: "restored" | "restricted" | "unavailable";
      readonly reasonCode?: string;
    }
  | {
      readonly ok: false;
      readonly focusResult: "unavailable";
      readonly reasonCode:
        | "focus.deadlineExpired"
        | "focus.rateLimited"
        | "focus.transportFailed"
        | "focus.invalidExtensionResponse"
        | "focus.extensionEpochChanged"
        | "focus.requestInProgress"
        | "focus.sessionRevoked";
    };

export interface GnomePreviousFocusClient {
  /**
   * Requests restoration of the extension-owned previous focus candidate.
   *
   * @param deadlineUnixMs The absolute deadline after which no call may begin.
   * @returns A minimized cross-platform focus result with no window metadata.
   */
  restore(deadlineUnixMs: number): Promise<GnomePreviousFocusCallResult>;

  /**
   * Revokes the current Host/extension protocol session.
   *
   * @returns Nothing after all future calls have been disabled.
   */
  revoke(): void;
}

interface RateState {
  readonly tokens: number;
  readonly lastRefillUnixMs: number;
}

/**
 * Tests whether an unknown value is a plain record suitable for protocol parsing.
 *
 * @param value The untrusted transport response.
 * @returns True only for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses the exact v1 extension response and rejects unknown fields.
 *
 * @param value The untrusted transport response.
 * @returns The parsed response, or undefined when any protocol invariant fails.
 */
function parseResponse(value: unknown): GnomePreviousFocusResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "extensionEpoch" ||
    keys[1] !== "protocolVersion" ||
    keys[2] !== "result" ||
    keys[3] !== "sequence"
  ) {
    return undefined;
  }
  const extensionEpoch = value["extensionEpoch"];
  const sequence = value["sequence"];
  const result = value["result"];
  if (
    value["protocolVersion"] !== GNOME_PREVIOUS_FOCUS_PROTOCOL_VERSION ||
    typeof extensionEpoch !== "string" ||
    extensionEpoch.length < 16 ||
    extensionEpoch.length > 128 ||
    !/^[A-Za-z0-9_-]+$/u.test(extensionEpoch) ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 1 ||
    typeof result !== "string" ||
    !responseResults.includes(result as GnomePreviousFocusResponseResult)
  ) {
    return undefined;
  }
  return {
    protocolVersion: GNOME_PREVIOUS_FOCUS_PROTOCOL_VERSION,
    extensionEpoch,
    sequence: sequence as number,
    result: result as GnomePreviousFocusResponseResult,
  };
}

/**
 * Maps GNOME-private outcomes to the minimized cross-platform focus vocabulary.
 *
 * @param result The validated extension result.
 * @returns A result that exposes no window, application or Shell metadata.
 */
function mapResult(
  result: GnomePreviousFocusResponseResult,
): GnomePreviousFocusCallResult {
  switch (result) {
    case "restored":
      return { ok: true, focusResult: "restored" };
    case "host-not-foreground":
      return {
        ok: true,
        focusResult: "restricted",
        reasonCode: "focus.hostNotForeground",
      };
    case "rate-limited":
      return {
        ok: true,
        focusResult: "restricted",
        reasonCode: "focus.extensionRateLimited",
      };
    case "protocol-rejected":
      return {
        ok: true,
        focusResult: "restricted",
        reasonCode: "focus.extensionProtocolRejected",
      };
    case "no-candidate":
      return {
        ok: true,
        focusResult: "unavailable",
        reasonCode: "focus.noPreviousCandidate",
      };
    case "candidate-invalid":
      return {
        ok: true,
        focusResult: "unavailable",
        reasonCode: "focus.previousCandidateInvalid",
      };
  }
}

/**
 * Creates a replay-resistant client for the future GNOME Shell extension transport.
 *
 * @param sessionNonce A random per-Host-start nonce with at least 128 bits of entropy.
 * @param transport The fixed-method platform transport owned by Electron Main.
 * @param now Supplies current Unix time for deterministic deadline and rate tests.
 * @returns A session client that invalidates itself when the extension epoch changes.
 * @throws {Error} When the supplied session nonce does not meet protocol constraints.
 */
export function createGnomePreviousFocusClient(
  sessionNonce: string,
  transport: GnomePreviousFocusTransport,
  now: () => number = Date.now,
): GnomePreviousFocusClient {
  if (
    sessionNonce.length < 16 ||
    sessionNonce.length > 128 ||
    !/^[A-Za-z0-9_-]+$/u.test(sessionNonce)
  ) {
    throw new Error("invalid GNOME previous-focus session nonce");
  }

  let sequence = 0;
  let extensionEpoch: string | undefined;
  let revoked = false;
  let requestInProgress = false;
  let rateState: RateState = { tokens: 8, lastRefillUnixMs: now() };

  /**
   * Consumes one local rate token using a 4-per-second refill and burst size of 8.
   *
   * @param currentUnixMs The current monotonic-enough wall-clock sample.
   * @returns True when this request may enter the transport.
   */
  function consumeRateToken(currentUnixMs: number): boolean {
    const elapsed = Math.max(0, currentUnixMs - rateState.lastRefillUnixMs);
    const tokens = Math.min(8, rateState.tokens + (elapsed * 4) / 1_000);
    if (tokens < 1) {
      rateState = { tokens, lastRefillUnixMs: currentUnixMs };
      return false;
    }
    rateState = { tokens: tokens - 1, lastRefillUnixMs: currentUnixMs };
    return true;
  }

  return Object.freeze({
    async restore(
      deadlineUnixMs: number,
    ): Promise<GnomePreviousFocusCallResult> {
      if (revoked) {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.sessionRevoked",
        };
      }
      if (requestInProgress) {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.requestInProgress",
        };
      }
      const currentUnixMs = now();
      if (
        !Number.isSafeInteger(deadlineUnixMs) ||
        deadlineUnixMs <= currentUnixMs
      ) {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.deadlineExpired",
        };
      }
      if (!consumeRateToken(currentUnixMs)) {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.rateLimited",
        };
      }

      sequence += 1;
      const request: GnomePreviousFocusRequest = Object.freeze({
        protocolVersion: GNOME_PREVIOUS_FOCUS_PROTOCOL_VERSION,
        sessionNonce,
        sequence,
        deadlineUnixMs,
      });
      let rawResponse: unknown;
      requestInProgress = true;
      try {
        rawResponse = await transport.restore(request);
      } catch {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.transportFailed",
        };
      } finally {
        requestInProgress = false;
      }
      if (now() >= deadlineUnixMs) {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.deadlineExpired",
        };
      }
      const response = parseResponse(rawResponse);
      if (response === undefined || response.sequence !== request.sequence) {
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.invalidExtensionResponse",
        };
      }
      if (
        extensionEpoch !== undefined &&
        extensionEpoch !== response.extensionEpoch
      ) {
        revoked = true;
        return {
          ok: false,
          focusResult: "unavailable",
          reasonCode: "focus.extensionEpochChanged",
        };
      }
      extensionEpoch = response.extensionEpoch;
      return mapResult(response.result);
    },
    revoke(): void {
      revoked = true;
      extensionEpoch = undefined;
    },
  });
}
