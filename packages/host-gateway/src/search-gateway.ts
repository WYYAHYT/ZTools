import { Ajv } from "ajv";

import type {
  ConnectionContext,
  RpcFailure,
  RpcResult,
} from "@ztools/contract-kernel";
import { isValidEffectResult } from "@ztools/contract-kernel";
import {
  SearchAckInputSchema,
  SearchEventSchema,
  SearchSessionReferenceSchema,
  SearchStartInputSchema,
  type SearchAckInput,
  type SearchEvent,
  type SearchSessionReference,
  type SearchStartInput,
  type SearchStartOutput,
} from "@ztools/host-contracts";
import type {
  SearchApplication,
  SearchSessionEvent,
  SearchSessionHandle,
} from "@ztools/search-application";
import type { RegisteredAction } from "./action-gateway.js";

const MAX_UNACKED_BATCHES = 4;
const ACK_WAIT_TIMEOUT_MS = 2_000;
const MAX_EVENT_BYTES = 64 * 1_024;

interface SearchOwner {
  readonly context: ConnectionContext;
  readonly sessionId: string;
  readonly abortController: AbortController;
  readonly pendingAcks: Set<number>;
  readonly capacityWaiters: Set<() => void>;
  readonly abortFromConnection: () => void;
  handle?: SearchSessionHandle;
  terminal: boolean;
}

export interface SearchGatewayResourceSnapshot {
  readonly activeSessionCount: number;
  readonly unackedBatchCount: number;
  readonly capacityWaiterCount: number;
}

export interface HostSearchGateway {
  /**
   * Starts a connection-owned search stream after validating the request payload.
   *
   * @param context The trusted renderer connection identity.
   * @param input The untrusted search start payload.
   * @param emit The delivery callback for validated stream events.
   * @returns A stable RPC result containing the owned session reference.
   */
  start(
    context: ConnectionContext,
    input: unknown,
    emit: (event: SearchEvent) => void,
  ): RpcResult<SearchStartOutput>;

  /**
   * Cancels a session only when it belongs to the trusted connection.
   *
   * @param context The trusted renderer connection identity.
   * @param input The untrusted session reference.
   * @returns A stable cancellation result.
   */
  cancel(context: ConnectionContext, input: unknown): RpcResult<null>;

  /**
   * Acknowledges one result batch and releases one bounded stream slot.
   *
   * @param context The trusted renderer connection identity.
   * @param input The untrusted session and sequence reference.
   * @returns A stable acknowledgement result.
   */
  ack(context: ConnectionContext, input: unknown): RpcResult<null>;

  /**
   * Revokes all sessions owned by a connection.
   *
   * @param context The connection being revoked.
   * @returns Nothing after all owned search resources are released.
   */
  revoke(context: ConnectionContext): void;

  /**
   * Returns aggregate payload-free stream resource counts.
   *
   * @returns A frozen snapshot for tests and safe diagnostics.
   */
  getResourceSnapshot(): SearchGatewayResourceSnapshot;
}

export interface HostSearchGatewayOptions {
  readonly createActionToken: () => string;
  readonly registerAction: (
    context: ConnectionContext,
    action: RegisteredAction,
  ) => void;
}

/**
 * Creates a stable read-only failure envelope for the Host Search boundary.
 *
 * @param context The trusted connection used as the correlation source.
 * @param category The stable failure category.
 * @param code The machine-readable failure code.
 * @param messageKey The localization key safe to expose to the Host Renderer.
 * @returns A payload-free failure result.
 */
function failure(
  context: ConnectionContext,
  category: RpcFailure["category"],
  code: string,
  messageKey: string,
): RpcFailure {
  if (!isValidEffectResult("read-only", category, "not-applicable", "never")) {
    throw new Error("Invalid Host Search Gateway failure combination");
  }
  return {
    ok: false,
    category,
    effectOutcome: "not-applicable",
    code,
    messageKey,
    retryability: "never",
    correlationId: context.connectionId,
  };
}

/**
 * Creates the dedicated Host Search stream gateway with connection ownership and bounded acknowledgements.
 *
 * @param application The platform-independent Search Application.
 * @returns A gateway that exposes no generic event subscription mechanism.
 */
export function createHostSearchGateway(
  application: SearchApplication,
  options: HostSearchGatewayOptions = {
    createActionToken: () => crypto.randomUUID(),
    registerAction: () => undefined,
  },
): HostSearchGateway {
  const ajv = new Ajv({ allErrors: false, ownProperties: true });
  const validateStart = ajv.compile(SearchStartInputSchema);
  const validateReference = ajv.compile(SearchSessionReferenceSchema);
  const validateAck = ajv.compile(SearchAckInputSchema);
  const validateEvent = ajv.compile(SearchEventSchema);
  const owners = new Map<ConnectionContext, SearchOwner>();

  /**
   * Releases waiters and connection listeners owned by one search stream.
   *
   * @param owner The stream owner being removed.
   * @returns Nothing after all gateway resources are released.
   */
  function cleanup(owner: SearchOwner): void {
    owner.capacityWaiters.forEach((release) => {
      release();
    });
    owner.capacityWaiters.clear();
    owner.pendingAcks.clear();
    owner.context.signal.removeEventListener(
      "abort",
      owner.abortFromConnection,
    );
    if (owners.get(owner.context) === owner) {
      owners.delete(owner.context);
    }
  }

  /**
   * Cancels one owner and then releases all gateway-owned resources.
   *
   * @param owner The active stream owner.
   * @param reason The stable internal cancellation reason.
   * @returns Nothing after cancellation and cleanup.
   */
  function cancelOwner(owner: SearchOwner, reason: string): void {
    owner.abortController.abort(reason);
    owner.handle?.cancel();
    cleanup(owner);
  }

  /**
   * Finds a session only through its trusted connection and opaque ID.
   *
   * @param context The trusted connection identity.
   * @param sessionId The untrusted session identifier to compare.
   * @returns The current owner or undefined when ownership does not match.
   */
  function findOwner(
    context: ConnectionContext,
    sessionId: string,
  ): SearchOwner | undefined {
    const owner = owners.get(context);
    return owner?.sessionId === sessionId ? owner : undefined;
  }

  /**
   * Waits for an acknowledgement slot and aborts a stalled stream on timeout.
   *
   * @param owner The stream whose unacknowledged window is full.
   * @returns Nothing once capacity exists or the stream has been cancelled.
   */
  async function waitForCapacity(owner: SearchOwner): Promise<void> {
    if (
      owner.pendingAcks.size < MAX_UNACKED_BATCHES ||
      owner.abortController.signal.aborted
    ) {
      return;
    }
    await new Promise<void>((resolve) => {
      const release = (): void => {
        clearTimeout(timeout);
        owner.capacityWaiters.delete(release);
        resolve();
      };
      const timeout = setTimeout((): void => {
        // A Renderer that stops acknowledging must not retain Provider or stream resources.
        cancelOwner(owner, "search-ack-timeout");
        release();
      }, ACK_WAIT_TIMEOUT_MS);
      owner.capacityWaiters.add(release);
    });
  }

  const gateway: HostSearchGateway = {
    start(context, input, emit): RpcResult<SearchStartOutput> {
      if (context.signal.aborted) {
        return failure(
          context,
          "rejected",
          "permission.callerRoleDenied",
          "gateway.callerRoleDenied",
        );
      }
      if (!validateStart(input)) {
        return failure(
          context,
          "protocol",
          "protocol.invalidPayload",
          "gateway.invalidPayload",
        );
      }
      const request = input as SearchStartInput;
      if (Array.from(request.query).length > 256) {
        return failure(
          context,
          "protocol",
          "protocol.queryTooLong",
          "search.queryTooLong",
        );
      }

      const previousOwner = owners.get(context);
      if (previousOwner !== undefined) {
        cancelOwner(previousOwner, "search-session-replaced");
      }

      const abortController = new AbortController();
      const abortFromConnection = (): void => {
        const current = owners.get(context);
        if (current !== undefined) {
          cancelOwner(current, "connection-revoked");
        }
      };
      const owner: SearchOwner = {
        context,
        sessionId: request.sessionId,
        abortController,
        pendingAcks: new Set<number>(),
        capacityWaiters: new Set<() => void>(),
        abortFromConnection,
        terminal: false,
      };
      owners.set(context, owner);
      context.signal.addEventListener("abort", abortFromConnection, {
        once: true,
      });

      const deliver = (event: SearchSessionEvent): void => {
        const transportEvent = {
          ...event,
          emittedAtUnixMs: Date.now(),
        };
        let outputEvent: SearchEvent = transportEvent as SearchEvent;
        if (transportEvent.type === "result-batch") {
          const results = transportEvent.results.map((result) => {
            const actionToken = options.createActionToken();
            options.registerAction(context, {
              sessionId: transportEvent.sessionId,
              revision: transportEvent.revision,
              resultId: result.resultId,
              actionToken,
              actionId: result.actionId,
            });
            return { ...result, actionToken };
          });
          outputEvent = { ...transportEvent, results } as SearchEvent;
        }
        const encodedByteLength = new TextEncoder().encode(
          JSON.stringify(outputEvent),
        ).byteLength;
        if (
          encodedByteLength > MAX_EVENT_BYTES ||
          !validateEvent(outputEvent)
        ) {
          cancelOwner(owner, "invalid-search-event");
          return;
        }
        emit(outputEvent);
      };

      owner.handle = application.start(
        request.sessionId,
        request.query,
        async (event: SearchSessionEvent): Promise<void> => {
          if (owners.get(context) !== owner) {
            return;
          }
          if (event.type === "result-batch") {
            await waitForCapacity(owner);
            if (owner.abortController.signal.aborted) {
              return;
            }
            owner.pendingAcks.add(event.sequence);
          }
          deliver(event);
          if (event.type === "completed" || event.type === "cancelled") {
            owner.terminal = true;
            if (owner.pendingAcks.size === 0) {
              cleanup(owner);
            }
          }
        },
        abortController.signal,
      );

      if (
        !isValidEffectResult("read-only", "success", "not-applicable", "never")
      ) {
        throw new Error("Invalid Host Search Gateway success combination");
      }
      return {
        ok: true,
        category: "success",
        effectOutcome: "not-applicable",
        correlationId: context.connectionId,
        value: { sessionId: request.sessionId, protocolVersion: 1 },
      };
    },
    cancel(context, input): RpcResult<null> {
      if (!validateReference(input)) {
        return failure(
          context,
          "protocol",
          "protocol.invalidPayload",
          "gateway.invalidPayload",
        );
      }
      const reference = input as SearchSessionReference;
      const owner = findOwner(context, reference.sessionId);
      if (owner === undefined) {
        return failure(
          context,
          "rejected",
          "permission.sessionOwnerDenied",
          "gateway.sessionOwnerDenied",
        );
      }
      cancelOwner(owner, "search-cancelled");
      return {
        ok: true,
        category: "success",
        effectOutcome: "not-applicable",
        correlationId: context.connectionId,
        value: null,
      };
    },
    ack(context, input): RpcResult<null> {
      if (!validateAck(input)) {
        return failure(
          context,
          "protocol",
          "protocol.invalidPayload",
          "gateway.invalidPayload",
        );
      }
      const request = input as SearchAckInput;
      const owner = findOwner(context, request.sessionId);
      if (owner === undefined || !owner.pendingAcks.has(request.sequence)) {
        return failure(
          context,
          "rejected",
          "permission.streamOwnerDenied",
          "gateway.streamOwnerDenied",
        );
      }
      owner.pendingAcks.delete(request.sequence);
      const waiter = owner.capacityWaiters.values().next().value;
      waiter?.();
      if (owner.terminal && owner.pendingAcks.size === 0) {
        cleanup(owner);
      }
      return {
        ok: true,
        category: "success",
        effectOutcome: "not-applicable",
        correlationId: context.connectionId,
        value: null,
      };
    },
    revoke(context): void {
      const owner = owners.get(context);
      if (owner !== undefined) {
        cancelOwner(owner, "connection-revoked");
      }
    },
    getResourceSnapshot(): SearchGatewayResourceSnapshot {
      return Object.freeze({
        activeSessionCount: owners.size,
        unackedBatchCount: Array.from(owners.values()).reduce(
          (total, owner) => total + owner.pendingAcks.size,
          0,
        ),
        capacityWaiterCount: Array.from(owners.values()).reduce(
          (total, owner) => total + owner.capacityWaiters.size,
          0,
        ),
      });
    },
  };
  return gateway;
}

export const searchGatewayLimits = Object.freeze({
  maxUnackedBatches: MAX_UNACKED_BATCHES,
  ackWaitTimeoutMs: ACK_WAIT_TIMEOUT_MS,
  maxEventBytes: MAX_EVENT_BYTES,
});
