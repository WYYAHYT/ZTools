import { Ajv } from "ajv";

import {
  isValidEffectResult,
  type ConnectionContext,
  type EffectKind,
  type EffectOutcome,
  type RpcFailure,
  type RpcResult,
  type RpcSuccess,
  type Retryability,
} from "@ztools/contract-kernel";
import {
  ActionExecuteInputSchema,
  ActionExecuteOutputSchema,
  type ActionExecuteInput,
  type ActionExecuteOutput,
  WindowVisibilitySetInputSchema,
  type WindowVisibilitySetInput,
  WindowVisibilitySetOutputSchema,
} from "@ztools/host-contracts";
import type {
  HideAndRestoreResult,
  SetVisibilityResult,
  WindowFocusCapability,
} from "@ztools/platform-capabilities";

export interface RegisteredAction {
  readonly sessionId: string;
  readonly revision: number;
  readonly resultId: string;
  readonly actionToken: string;
  readonly actionId: string;
}

export interface HostActionGateway {
  /**
   * Registers an action token for a result shown to one trusted connection.
   *
   * @param context The connection that received the result.
   * @param action The opaque action capability metadata.
   * @returns Nothing after bounded registration.
   */
  register(context: ConnectionContext, action: RegisteredAction): void;

  /**
   * Executes only a previously displayed, connection-owned action token.
   *
   * @param context The trusted connection identity.
   * @param input The untrusted opaque action request.
   * @returns The independently reported effect and focus outcome.
   */
  execute(
    context: ConnectionContext,
    input: unknown,
  ): Promise<RpcResult<ActionExecuteOutput>>;

  /**
   * Changes Host window visibility through the named Capability contract.
   *
   * @param context The trusted Host Renderer connection.
   * @param input The untrusted visibility and reason payload.
   * @returns The observed visibility outcome.
   */
  setVisibility(
    context: ConnectionContext,
    input: unknown,
  ): Promise<RpcResult<SetVisibilityResult>>;

  /**
   * Revokes all action tokens owned by a connection.
   *
   * @param context The connection being revoked.
   * @returns Nothing after action capability cleanup.
   */
  revoke(context: ConnectionContext): void;
}

/**
 * Creates a stable failure after validating effect certainty and recovery semantics.
 *
 * @param context The trusted connection used as the correlation source.
 * @param effect The effect declared by the concrete write method.
 * @param category The stable reason the method did not return normal success.
 * @param effectOutcome The independently established write certainty.
 * @param retryability The only recovery behavior exposed to the caller.
 * @param code The machine-readable stable failure code.
 * @param messageKey The localized Host UI message key.
 * @returns A failure that satisfies the shared ADR-0012 matrix.
 */
function failure(
  context: ConnectionContext,
  effect: Exclude<EffectKind, "read-only">,
  category: RpcFailure["category"],
  effectOutcome: Exclude<EffectOutcome, "not-applicable">,
  retryability: Retryability,
  code: string,
  messageKey: string,
): RpcFailure {
  if (!isValidEffectResult(effect, category, effectOutcome, retryability)) {
    throw new Error("Invalid Host Action Gateway result combination");
  }
  return {
    ok: false,
    category,
    effectOutcome,
    code,
    messageKey,
    retryability,
    correlationId: context.connectionId,
  };
}

/**
 * Creates a validated committed write result for an Action Gateway method.
 *
 * @param context The trusted connection used as the correlation source.
 * @param effect The effect declared by the concrete method contract.
 * @param value The runtime-Schema-validated method output.
 * @returns A success result whose certainty cannot contradict the method effect.
 */
function success<T>(
  context: ConnectionContext,
  effect: Exclude<EffectKind, "read-only">,
  value: T,
): RpcSuccess<T> {
  if (!isValidEffectResult(effect, "success", "committed", "never")) {
    throw new Error("Invalid Host Action Gateway success combination");
  }
  return {
    ok: true,
    category: "success",
    effectOutcome: "committed",
    correlationId: context.connectionId,
    value,
  };
}

/**
 * Creates a connection-bound Host action gateway with a fixed action allowlist.
 *
 * @param executor The trusted Window Capability adapter.
 * @returns A gateway that rejects guessed, stale and cross-connection tokens.
 */
export function createHostActionGateway(
  executor: WindowFocusCapability,
): HostActionGateway {
  const ajv = new Ajv({ allErrors: false, ownProperties: true });
  const validateInput = ajv.compile(ActionExecuteInputSchema);
  const validateOutput = ajv.compile(ActionExecuteOutputSchema);
  const validateVisibilityInput = ajv.compile(WindowVisibilitySetInputSchema);
  const validateVisibilityOutput = ajv.compile(WindowVisibilitySetOutputSchema);
  const actions = new Map<ConnectionContext, Map<string, RegisteredAction>>();

  return {
    register(context, action): void {
      if (context.signal.aborted) {
        return;
      }
      const owned = actions.get(context) ?? new Map<string, RegisteredAction>();
      for (const [token, existing] of owned) {
        if (
          existing.sessionId !== action.sessionId ||
          existing.revision < action.revision
        ) {
          owned.delete(token);
        }
      }
      if (owned.size >= 256) {
        const oldest = owned.keys().next().value;
        if (oldest !== undefined) {
          owned.delete(oldest);
        }
      }
      owned.set(action.actionToken, Object.freeze({ ...action }));
      actions.set(context, owned);
    },
    async execute(context, input): Promise<RpcResult<ActionExecuteOutput>> {
      if (context.signal.aborted) {
        return failure(
          context,
          "non-idempotent-write",
          "protocol",
          "not-started",
          "never",
          "connection.revoked",
          "gateway.connectionRevoked",
        );
      }
      if (!validateInput(input)) {
        return failure(
          context,
          "non-idempotent-write",
          "protocol",
          "not-started",
          "never",
          "protocol.invalidPayload",
          "gateway.invalidPayload",
        );
      }
      const request = input as ActionExecuteInput;
      const action = actions.get(context)?.get(request.actionToken);
      if (
        action === undefined ||
        action.sessionId !== request.sessionId ||
        action.actionId !== "host-action:hide-ztools"
      ) {
        return failure(
          context,
          "non-idempotent-write",
          "rejected",
          "not-started",
          "after-state-change",
          "permission.actionDenied",
          "action.notAvailable",
        );
      }
      let outcome: HideAndRestoreResult;
      try {
        outcome = await executor.hideAndRestorePrevious();
      } catch {
        return failure(
          context,
          "non-idempotent-write",
          "internal",
          "unknown",
          "query-status-first",
          "internal.actionAdapterFailed",
          "action.outcomeUnknown",
        );
      }
      if (!validateOutput(outcome)) {
        return failure(
          context,
          "non-idempotent-write",
          "internal",
          "unknown",
          "query-status-first",
          "internal.invalidActionResult",
          "action.outcomeUnknown",
        );
      }
      if (outcome.effectOutcome !== "committed") {
        return failure(
          context,
          "non-idempotent-write",
          outcome.effectOutcome === "not-started" ? "unavailable" : "internal",
          outcome.effectOutcome,
          outcome.effectOutcome === "unknown"
            ? "query-status-first"
            : "after-state-change",
          outcome.effectOutcome === "unknown"
            ? "action.outcomeUnknown"
            : "action.notCommitted",
          outcome.effectOutcome === "unknown"
            ? "action.outcomeUnknown"
            : "action.unavailable",
        );
      }
      return success(context, "non-idempotent-write", outcome);
    },
    async setVisibility(
      context,
      input,
    ): Promise<RpcResult<SetVisibilityResult>> {
      if (context.signal.aborted) {
        return failure(
          context,
          "idempotent-write",
          "protocol",
          "not-started",
          "never",
          "connection.revoked",
          "gateway.connectionRevoked",
        );
      }
      if (!validateVisibilityInput(input)) {
        return failure(
          context,
          "idempotent-write",
          "protocol",
          "not-started",
          "never",
          "protocol.invalidPayload",
          "gateway.invalidPayload",
        );
      }
      const request = input as WindowVisibilitySetInput;
      let result: SetVisibilityResult;
      try {
        result = await executor.setVisibility(request.visibility);
      } catch {
        return failure(
          context,
          "idempotent-write",
          "internal",
          "unknown",
          "query-status-first",
          "internal.visibilityAdapterFailed",
          "window.visibilityOutcomeUnknown",
        );
      }
      if (!validateVisibilityOutput(result)) {
        return failure(
          context,
          "idempotent-write",
          "internal",
          "unknown",
          "query-status-first",
          "internal.invalidVisibilityResult",
          "window.visibilityOutcomeUnknown",
        );
      }
      const requestedVisibility =
        request.visibility === "show" ? "visible" : "hidden";
      if (
        result.effectOutcome === "committed" &&
        result.visibility !== requestedVisibility
      ) {
        return failure(
          context,
          "idempotent-write",
          "internal",
          "unknown",
          "query-status-first",
          "internal.inconsistentVisibilityResult",
          "window.visibilityOutcomeUnknown",
        );
      }
      if (result.effectOutcome !== "committed") {
        return failure(
          context,
          "idempotent-write",
          "internal",
          result.effectOutcome,
          result.effectOutcome === "unknown"
            ? "query-status-first"
            : "after-state-change",
          "window.visibilityNotCommitted",
          "window.visibilityUnavailable",
        );
      }
      return success(context, "idempotent-write", result);
    },
    revoke(context): void {
      actions.delete(context);
    },
  };
}
