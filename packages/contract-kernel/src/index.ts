import { Type, type Static } from "@sinclair/typebox";

export const callerRoles = ["host-renderer"] as const;
export type CallerRole = (typeof callerRoles)[number];

export const effectKinds = [
  "read-only",
  "idempotent-write",
  "non-idempotent-write",
] as const;
export type EffectKind = (typeof effectKinds)[number];

export const effectOutcomes = [
  "not-applicable",
  "not-started",
  "committed",
  "not-committed",
  "unknown",
] as const;
export type EffectOutcome = (typeof effectOutcomes)[number];

export const resultCategories = [
  "success",
  "rejected",
  "cancelled",
  "deadline-exceeded",
  "unavailable",
  "conflict",
  "internal",
  "protocol",
] as const;
export type ResultCategory = (typeof resultCategories)[number];

export const retryabilities = [
  "never",
  "after-user-action",
  "after-state-change",
  "safe-with-backoff",
  "query-status-first",
] as const;
export type Retryability = (typeof retryabilities)[number];

export const RpcRequestSchema = Type.Object(
  {
    requestId: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[A-Za-z0-9_-]+$",
    }),
    method: Type.String({ minLength: 1, maxLength: 128 }),
    version: Type.Literal(1),
    deadlineUnixMs: Type.Integer({ minimum: 0 }),
    payload: Type.Unknown(),
  },
  { additionalProperties: false },
);

export type RpcRequest = Static<typeof RpcRequestSchema>;

export interface ConnectionContext {
  readonly connectionId: string;
  readonly connectionEpoch: number;
  readonly callerRole: CallerRole;
  readonly protocolVersion: 1;
  readonly signal: AbortSignal;
}

export interface RpcSuccess<T> {
  readonly ok: true;
  readonly category: "success";
  readonly effectOutcome: EffectOutcome;
  readonly correlationId: string;
  readonly value: T;
}

export interface RpcFailure {
  readonly ok: false;
  readonly category: Exclude<ResultCategory, "success">;
  readonly effectOutcome: EffectOutcome;
  readonly code: string;
  readonly messageKey: string;
  readonly retryability: Retryability;
  readonly correlationId: string;
}

export type RpcResult<T> = RpcSuccess<T> | RpcFailure;

/**
 * Validates that a method effect and returned outcome cannot authorize an unsafe retry.
 *
 * @param effect The effect declared by the method contract.
 * @param category The result category produced by the handler or gateway.
 * @param outcome The independently reported side-effect certainty.
 * @param retryability The recovery behavior exposed to the caller.
 * @returns True when the combination is internally consistent.
 */
export function isValidEffectResult(
  effect: EffectKind,
  category: ResultCategory,
  outcome: EffectOutcome,
  retryability: Retryability,
): boolean {
  if (effect === "read-only") {
    if (outcome !== "not-applicable") {
      return false;
    }
    switch (category) {
      case "success":
      case "cancelled":
      case "internal":
      case "protocol":
        return retryability === "never";
      case "rejected":
        return (
          retryability === "never" ||
          retryability === "after-user-action" ||
          retryability === "after-state-change"
        );
      case "deadline-exceeded":
        return retryability === "safe-with-backoff";
      case "unavailable":
        return (
          retryability === "safe-with-backoff" ||
          retryability === "after-user-action" ||
          retryability === "after-state-change"
        );
      case "conflict":
        return retryability === "after-state-change";
    }
  }

  if (category === "success") {
    return outcome === "committed" && retryability === "never";
  }

  if (outcome === "not-applicable") {
    return false;
  }

  if (outcome === "committed") {
    return (
      (category === "cancelled" ||
        category === "deadline-exceeded" ||
        category === "unavailable" ||
        category === "internal") &&
      retryability === "never"
    );
  }

  if (outcome === "unknown") {
    return (
      (category === "cancelled" ||
        category === "deadline-exceeded" ||
        category === "unavailable" ||
        category === "internal") &&
      retryability === "query-status-first"
    );
  }

  if (retryability === "query-status-first") {
    return false;
  }

  if (
    effect === "non-idempotent-write" &&
    retryability === "safe-with-backoff"
  ) {
    return false;
  }

  if (category === "protocol") {
    return outcome === "not-started" && retryability === "never";
  }

  if (category === "rejected") {
    return (
      outcome === "not-started" &&
      (retryability === "never" ||
        retryability === "after-user-action" ||
        retryability === "after-state-change")
    );
  }

  if (category === "conflict") {
    return retryability === "never" || retryability === "after-state-change";
  }

  return true;
}
