export const PROTOCOL_VERSION = 1;
export const BUS_NAME = "com.ztools.ZToolsPreviousFocus";
export const OBJECT_PATH = "/com/ztools/ZToolsPreviousFocus";
export const INTERFACE_NAME = "com.ztools.ZToolsPreviousFocus";

const REQUEST_KEYS = [
  "deadlineUnixMs",
  "protocolVersion",
  "sequence",
  "sessionNonce",
];

/**
 * Creates the in-memory focus history and strict protocol handler used by the extension.
 *
 * @param {object} options Runtime callbacks and fixed extension identity.
 * @param {string} options.extensionEpoch Random epoch generated for this Shell extension instance.
 * @param {function(object): boolean} options.isHostWindow Identifies a ZTools Shell window.
 * @param {function(object): boolean} options.isRestorableWindow Identifies an eligible application window.
 * @param {function(object): boolean} options.activateWindow Activates the candidate without accepting a target from the caller.
 * @param {function(): object|null} options.getFocusedWindow Reads the current Shell focus.
 * @param {function(object|null, object|null): void} [options.onCandidateChanged] Observes old and new candidate ownership for platform lifecycle subscriptions.
 * @param {function(): number} [options.now] Returns Unix milliseconds.
 * @returns {{observeFocusWindow: function(object|null): void, invalidateCandidate: function(object): void, invalidateFocusContext: function(): void, restore: function(string): string, revoke: function(): void}}
 * @throws {Error} If the extension epoch is not a valid protocol identity.
 */
export function createFocusStateMachine({
  extensionEpoch,
  isHostWindow,
  isRestorableWindow,
  activateWindow,
  getFocusedWindow,
  onCandidateChanged = () => {},
  now = () => Date.now(),
}) {
  if (
    typeof extensionEpoch !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(extensionEpoch)
  ) {
    throw new Error("invalid extension epoch");
  }

  let previousCandidate = null;
  let sessionNonce = null;
  let lastSequence = 0;
  let revoked = false;
  let tokens = 8;
  let lastRefill = now();
  let hostTransitionDeadline = 0;

  /**
   * Replaces the owned candidate and reports the lifecycle ownership transition.
   *
   * @param {object|null} candidate The next restorable window or null when ownership ends.
   * @returns {void}
   */
  const setPreviousCandidate = (candidate) => {
    if (previousCandidate === candidate) return;
    const oldCandidate = previousCandidate;
    previousCandidate = candidate;
    onCandidateChanged(oldCandidate, candidate);
  };

  const response = (sequence, result) =>
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      extensionEpoch,
      sequence,
      result,
    });

  const consumeToken = (current) => {
    const elapsed = Math.max(0, current - lastRefill);
    tokens = Math.min(8, tokens + (elapsed * 4) / 1000);
    lastRefill = current;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  const reject = (sequence = 0) => response(sequence, "protocol-rejected");

  return Object.freeze({
    observeFocusWindow(window) {
      if (window === null || window === undefined) {
        return;
      }
      if (isHostWindow(window)) {
        hostTransitionDeadline = now() + 750;
        return;
      }
      if (now() <= hostTransitionDeadline) return;
      if (isRestorableWindow(window)) setPreviousCandidate(window);
    },

    /**
     * Clears a candidate only when the reported window still owns that role.
     *
     * @param {object} window The platform window whose lifecycle ended.
     * @returns {void}
     */
    invalidateCandidate(window) {
      if (previousCandidate === window) setPreviousCandidate(null);
    },

    /**
     * Clears window and transition state after a workspace or session context change.
     *
     * @returns {void}
     */
    invalidateFocusContext() {
      setPreviousCandidate(null);
      hostTransitionDeadline = 0;
    },

    restore(encodedRequest) {
      if (
        revoked ||
        typeof encodedRequest !== "string" ||
        encodedRequest.length > 2048
      )
        return reject();
      let request;
      try {
        request = JSON.parse(encodedRequest);
      } catch {
        return reject();
      }
      if (
        request === null ||
        typeof request !== "object" ||
        Array.isArray(request) ||
        JSON.stringify(Object.keys(request).sort()) !==
          JSON.stringify(REQUEST_KEYS)
      ) {
        return reject();
      }
      const {
        protocolVersion,
        sessionNonce: nonce,
        sequence,
        deadlineUnixMs,
      } = request;
      const current = now();
      if (
        protocolVersion !== PROTOCOL_VERSION ||
        typeof nonce !== "string" ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
        !Number.isSafeInteger(sequence) ||
        sequence < 1 ||
        !Number.isSafeInteger(deadlineUnixMs) ||
        deadlineUnixMs <= current ||
        (sessionNonce === nonce && sequence !== lastSequence + 1) ||
        (sessionNonce !== nonce && sequence !== 1)
      ) {
        return reject(Number.isSafeInteger(sequence) ? sequence : 0);
      }
      const replacesActiveSession =
        sessionNonce !== null && sessionNonce !== nonce;
      if (!replacesActiveSession) {
        sessionNonce = nonce;
        lastSequence = sequence;
      }
      if (!consumeToken(current)) return response(sequence, "rate-limited");
      if (
        !isHostWindow(getFocusedWindow()) &&
        current > hostTransitionDeadline
      ) {
        return response(sequence, "host-not-foreground");
      }
      // A new Host may replace a stale session only from sequence 1 while ZTools owns focus.
      if (replacesActiveSession) {
        sessionNonce = nonce;
        lastSequence = sequence;
      }
      if (now() >= deadlineUnixMs) return reject(sequence);
      const candidate = previousCandidate;
      if (candidate === null || !isRestorableWindow(candidate)) {
        setPreviousCandidate(null);
        return response(sequence, "no-candidate");
      }
      let activated = false;
      try {
        activated = activateWindow(candidate) === true;
      } catch {
        activated = false;
      }
      if (!activated) {
        setPreviousCandidate(null);
        hostTransitionDeadline = 0;
        return response(sequence, "candidate-invalid");
      }
      setPreviousCandidate(null);
      hostTransitionDeadline = 0;
      return response(sequence, "restored");
    },

    revoke() {
      revoked = true;
      setPreviousCandidate(null);
      sessionNonce = null;
      lastSequence = 0;
      hostTransitionDeadline = 0;
    },
  });
}
