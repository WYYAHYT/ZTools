import { Ajv } from "ajv";

import {
  RpcRequestSchema,
  isValidEffectResult,
  type ConnectionContext,
  type RpcFailure,
  type RpcRequest,
  type RpcResult,
  type RpcSuccess,
} from "@ztools/contract-kernel";
import type { BootstrapQuery } from "@ztools/bootstrap-application";
import {
  HOST_BOOTSTRAP_METHOD,
  HostBootstrapInputSchema,
  HostBootstrapOutputSchema,
  type HostBootstrapInput,
  type HostBootstrapOutput,
} from "@ztools/host-contracts";

const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_ACTIVE_REQUESTS = 16;
const MAX_TOMBSTONES = 256;
const MAX_CONNECTION_EPOCHS = 256;
const TOMBSTONE_TTL_MS = 60_000;
const MAX_METHOD_DEADLINE_MS = 2_000;
const RATE_WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 100;
const BURST_WINDOW_MS = 1_000;
const MAX_REQUESTS_PER_BURST = 20;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Checks a runtime caller role at the trust boundary.
 *
 * @param role The role obtained from the trusted connection context.
 * @returns True only when the role is allowed by the Gate 1 Host contract.
 */
function isAllowedCallerRole(role: unknown): role is "host-renderer" {
  return role === "host-renderer";
}

export interface GatewayTransportMessage {
  readonly request: unknown;
  readonly encodedByteLength: number;
}

export interface GatewayResourceSnapshot {
  readonly activeConnectionCount: number;
  readonly activeRequestCount: number;
  readonly tombstoneConnectionCount: number;
  readonly tombstoneCount: number;
  readonly rateWindowConnectionCount: number;
  readonly connectionEpochCount: number;
}

interface ActiveRequest {
  readonly requestId: string;
  readonly abortController: AbortController;
  readonly timeout: ReturnType<typeof setTimeout>;
  timedOut: boolean;
}

interface Tombstone {
  readonly expiresAt: number;
}

export interface HostGateway {
  /**
   * Dispatches one untrusted transport message through identity, size, method, schema and application checks.
   *
   * @param context The trusted immutable connection identity created by the host.
   * @param message The untrusted decoded request and its transport-level byte size.
   * @returns A stable success or failure envelope safe for the caller role.
   */
  dispatch(
    context: ConnectionContext,
    message: GatewayTransportMessage,
  ): Promise<RpcResult<HostBootstrapOutput>>;

  /**
   * Revokes a connection and cancels all work owned by that connection.
   *
   * @param context The connection whose requests must be revoked.
   * @returns Nothing after gateway-owned resources have been released.
   */
  revoke(context: ConnectionContext): void;

  /**
   * Returns aggregate, payload-free resource counts for tests and host diagnostics.
   *
   * @returns A frozen snapshot that cannot expose request contents or identities.
   */
  getResourceSnapshot(): GatewayResourceSnapshot;
}

/**
 * Creates the Gate 1 Host Gateway with one explicit read-only method and default-deny routing.
 *
 * @param bootstrapQuery The application-owned bootstrap use case.
 * @returns A gateway that never exposes the application implementation directly.
 */
export function createHostGateway(bootstrapQuery: BootstrapQuery): HostGateway {
  const ajv = new Ajv({
    allErrors: false,
    removeAdditional: false,
    ownProperties: true,
  });
  const validateRequest = ajv.compile(RpcRequestSchema);
  const validateBootstrapInput = ajv.compile(HostBootstrapInputSchema);
  const validateBootstrapOutput = ajv.compile(HostBootstrapOutputSchema);
  const activeRequests = new Map<string, Map<string, ActiveRequest>>();
  const tombstones = new Map<string, Map<string, Tombstone>>();
  const revokedContexts = new WeakSet<ConnectionContext>();
  const connectionEpochs = new Map<string, number>();
  const requestTimestamps = new Map<string, number[]>();

  /**
   * Records the newest observed epoch while keeping connection history bounded.
   *
   * @param connectionId The trusted host-created connection identifier.
   * @param connectionEpoch The trusted monotonically increasing connection epoch.
   * @returns Nothing after the bounded history has been updated.
   */
  function recordConnectionEpoch(
    connectionId: string,
    connectionEpoch: number,
  ): void {
    const knownEpoch = connectionEpochs.get(connectionId);
    if (knownEpoch !== undefined && connectionEpoch < knownEpoch) {
      return;
    }
    connectionEpochs.set(connectionId, connectionEpoch);
    while (connectionEpochs.size > MAX_CONNECTION_EPOCHS) {
      const oldestConnectionId = connectionEpochs.keys().next().value;
      if (oldestConnectionId === undefined) {
        break;
      }
      connectionEpochs.delete(oldestConnectionId);
    }
  }

  return {
    async dispatch(context, message): Promise<RpcResult<HostBootstrapOutput>> {
      const correlationId = context.connectionId;
      const reject = (
        category: RpcFailure["category"],
        code: string,
        messageKey: string,
      ): RpcFailure => {
        const retryability =
          category === "deadline-exceeded"
            ? "safe-with-backoff"
            : category === "rejected" || category === "unavailable"
              ? "after-state-change"
              : "never";
        if (
          !isValidEffectResult(
            "read-only",
            category,
            "not-applicable",
            retryability,
          )
        ) {
          throw new Error("Invalid read-only Gateway result combination");
        }
        return {
          ok: false,
          category,
          effectOutcome: "not-applicable",
          code,
          messageKey,
          retryability,
          correlationId,
        };
      };

      if (revokedContexts.has(context) || context.signal.aborted) {
        return reject(
          "protocol",
          "connection.revoked",
          "gateway.connectionRevoked",
        );
      }

      const knownEpoch = connectionEpochs.get(context.connectionId);
      if (knownEpoch !== undefined && context.connectionEpoch < knownEpoch) {
        return reject(
          "protocol",
          "connection.staleEpoch",
          "gateway.staleConnection",
        );
      }
      if (knownEpoch === undefined || context.connectionEpoch > knownEpoch) {
        recordConnectionEpoch(context.connectionId, context.connectionEpoch);
      }

      if (
        message.encodedByteLength > MAX_MESSAGE_BYTES ||
        message.encodedByteLength <= 0 ||
        !Number.isSafeInteger(message.encodedByteLength)
      ) {
        return reject(
          "protocol",
          "protocol.messageTooLarge",
          "gateway.messageTooLarge",
        );
      }

      if (!validateRequest(message.request)) {
        return reject(
          "protocol",
          "protocol.invalidRequest",
          "gateway.invalidRequest",
        );
      }

      const request = message.request as RpcRequest;
      if (request.method !== HOST_BOOTSTRAP_METHOD) {
        return reject(
          "protocol",
          "protocol.unknownMethod",
          "gateway.unknownMethod",
        );
      }

      if (!isAllowedCallerRole(context.callerRole)) {
        return reject(
          "rejected",
          "permission.callerRoleDenied",
          "gateway.callerRoleDenied",
        );
      }

      if (!validateBootstrapInput(request.payload)) {
        return reject(
          "protocol",
          "protocol.invalidPayload",
          "gateway.invalidPayload",
        );
      }

      const now = Date.now();
      const timestamps = (
        requestTimestamps.get(context.connectionId) ?? []
      ).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
      const burstCount = timestamps.filter(
        (timestamp) => now - timestamp < BURST_WINDOW_MS,
      ).length;
      if (
        timestamps.length >= MAX_REQUESTS_PER_WINDOW ||
        burstCount >= MAX_REQUESTS_PER_BURST
      ) {
        requestTimestamps.set(context.connectionId, timestamps);
        return reject(
          "rejected",
          "resource.requestRate",
          "gateway.requestRate",
        );
      }
      timestamps.push(now);
      requestTimestamps.set(context.connectionId, timestamps);

      const connectionTombstones = tombstones.get(context.connectionId);
      const tombstone = connectionTombstones?.get(request.requestId);
      if (tombstone !== undefined && tombstone.expiresAt > Date.now()) {
        return reject(
          "protocol",
          "protocol.requestReplayed",
          "gateway.requestReplayed",
        );
      }
      connectionTombstones?.delete(request.requestId);

      const requests =
        activeRequests.get(context.connectionId) ??
        new Map<string, ActiveRequest>();
      activeRequests.set(context.connectionId, requests);
      if (
        requests.size >= MAX_ACTIVE_REQUESTS ||
        requests.has(request.requestId)
      ) {
        return reject(
          "rejected",
          "resource.requestLimit",
          "gateway.requestLimit",
        );
      }

      const abortController = new AbortController();
      const abortFromConnection = (): void => {
        abortController.abort(context.signal.reason);
      };
      context.signal.addEventListener("abort", abortFromConnection, {
        once: true,
      });
      const activeRequest: ActiveRequest = {
        requestId: request.requestId,
        abortController,
        timeout: setTimeout(
          (): void => {
            activeRequest.timedOut = true;
            abortController.abort("deadline-exceeded");
          },
          Math.max(
            0,
            Math.min(
              request.deadlineUnixMs - Date.now(),
              MAX_METHOD_DEADLINE_MS,
            ),
          ),
        ),
        timedOut: false,
      };
      requests.set(request.requestId, activeRequest);

      try {
        const value = await bootstrapQuery.getBootstrap(abortController.signal);
        if (!validateBootstrapOutput(value)) {
          return reject(
            "internal",
            "internal.invalidApplicationResult",
            "gateway.internalError",
          );
        }
        const success: RpcSuccess<HostBootstrapOutput> = {
          ok: true,
          category: "success",
          effectOutcome: "not-applicable",
          correlationId,
          value,
        };
        if (
          !isValidEffectResult(
            "read-only",
            success.category,
            success.effectOutcome,
            "never",
          )
        ) {
          throw new Error("Invalid read-only Gateway success combination");
        }
        return success;
      } catch (error: unknown) {
        if (activeRequest.timedOut) {
          return reject(
            "deadline-exceeded",
            "request.deadlineExceeded",
            "gateway.deadlineExceeded",
          );
        }
        if (abortController.signal.aborted) {
          return reject("cancelled", "request.cancelled", "gateway.cancelled");
        }
        void error;
        return reject(
          "internal",
          "internal.applicationFailure",
          "gateway.internalError",
        );
      } finally {
        clearTimeout(activeRequest.timeout);
        context.signal.removeEventListener("abort", abortFromConnection);
        requests.delete(request.requestId);
        if (requests.size === 0) {
          activeRequests.delete(context.connectionId);
        }
        const currentTombstones =
          tombstones.get(context.connectionId) ?? new Map<string, Tombstone>();
        currentTombstones.set(request.requestId, {
          expiresAt: Date.now() + TOMBSTONE_TTL_MS,
        });
        while (currentTombstones.size > MAX_TOMBSTONES) {
          const oldest = currentTombstones.keys().next().value;
          if (oldest === undefined) {
            break;
          }
          currentTombstones.delete(oldest);
        }
        tombstones.set(context.connectionId, currentTombstones);
      }
    },
    revoke(context): void {
      revokedContexts.add(context);
      recordConnectionEpoch(context.connectionId, context.connectionEpoch);
      const requests = activeRequests.get(context.connectionId);
      requests?.forEach((request): void => {
        clearTimeout(request.timeout);
        request.abortController.abort("connection-revoked");
      });
      activeRequests.delete(context.connectionId);
      tombstones.delete(context.connectionId);
      requestTimestamps.delete(context.connectionId);
    },
    getResourceSnapshot(): GatewayResourceSnapshot {
      return Object.freeze({
        activeConnectionCount: activeRequests.size,
        activeRequestCount: Array.from(activeRequests.values()).reduce(
          (total, requests) => total + requests.size,
          0,
        ),
        tombstoneConnectionCount: tombstones.size,
        tombstoneCount: Array.from(tombstones.values()).reduce(
          (total, connectionTombstones) => total + connectionTombstones.size,
          0,
        ),
        rateWindowConnectionCount: requestTimestamps.size,
        connectionEpochCount: connectionEpochs.size,
      });
    },
  };
}

export const gatewayLimits = Object.freeze({
  maxMessageBytes: MAX_MESSAGE_BYTES,
  maxActiveRequests: MAX_ACTIVE_REQUESTS,
  maxTombstones: MAX_TOMBSTONES,
  maxConnectionEpochs: MAX_CONNECTION_EPOCHS,
  tombstoneTtlMs: TOMBSTONE_TTL_MS,
  maxMethodDeadlineMs: MAX_METHOD_DEADLINE_MS,
  rateWindowMs: RATE_WINDOW_MS,
  maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
  burstWindowMs: BURST_WINDOW_MS,
  maxRequestsPerBurst: MAX_REQUESTS_PER_BURST,
  requestIdPattern: REQUEST_ID_PATTERN.source,
});

export type { HostBootstrapInput };
export {
  createHostSearchGateway,
  searchGatewayLimits,
} from "./search-gateway.js";
export type { HostSearchGateway } from "./search-gateway.js";
export {
  createHostActionGateway,
  type HostActionGateway,
  type RegisteredAction,
} from "./action-gateway.js";
