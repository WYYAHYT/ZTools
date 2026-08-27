import {
  rankSearchCandidates,
  type RankedSearchResult,
  type SearchCandidate,
} from "@ztools/search-domain";

export interface SearchProviderBatch {
  readonly revision: number;
  readonly candidates: readonly SearchCandidate[];
}

export interface SearchProvider {
  readonly providerId: string;

  /**
   * Produces bounded candidate batches until completion or cancellation.
   *
   * @param query The normalized-size query accepted by the application boundary.
   * @param signal The owning search session cancellation signal.
   * @returns An asynchronous sequence of monotonically revised candidate batches.
   */
  search(
    query: string,
    signal: AbortSignal,
  ): AsyncIterable<SearchProviderBatch>;
}

export type SearchSessionEvent =
  | {
      readonly type: "started";
      readonly sessionId: string;
      readonly sequence: number;
    }
  | {
      readonly type: "result-batch";
      readonly sessionId: string;
      readonly sequence: number;
      readonly revision: number;
      readonly results: readonly RankedSearchResult[];
    }
  | {
      readonly type: "provider-failed";
      readonly sessionId: string;
      readonly sequence: number;
      readonly providerId: string;
      readonly code: "provider.failed";
    }
  | {
      readonly type: "completed" | "cancelled";
      readonly sessionId: string;
      readonly sequence: number;
    };

type SearchSessionEventPayload = SearchSessionEvent extends infer Event
  ? Event extends SearchSessionEvent
    ? Omit<Event, "sessionId" | "sequence">
    : never
  : never;

export interface SearchSessionHandle {
  readonly sessionId: string;

  /**
   * Cancels this session without affecting a newer replacement session.
   *
   * @returns Nothing after cancellation has been requested.
   */
  cancel(): void;
}

export interface SearchApplication {
  /**
   * Starts one search and atomically cancels the previous active session.
   *
   * @param sessionId The opaque ID minted by the trusted delivery layer.
   * @param query The user query containing at most 256 Unicode code points.
   * @param onEvent The synchronous sink for payload-bounded session events.
   * @param ownerSignal Cancels the session when its trusted connection ends.
   * @returns A handle that can cancel only the newly created session.
   * @throws {RangeError} When the query exceeds the accepted code-point limit.
   */
  start(
    sessionId: string,
    query: string,
    onEvent: (event: SearchSessionEvent) => void | Promise<void>,
    ownerSignal: AbortSignal,
  ): SearchSessionHandle;

  /**
   * Returns payload-free aggregate resource counts for verification.
   *
   * @returns The current active session and Provider task counts.
   */
  getResourceSnapshot(): {
    readonly activeSessionCount: number;
    readonly activeProviderTaskCount: number;
  };
}

/**
 * Creates a deterministic in-memory Host command Provider.
 *
 * @param candidates The immutable built-in command catalogue.
 * @returns A Provider that emits one bounded snapshot and performs no persistence.
 */
export function createInMemorySearchProvider(
  candidates: readonly SearchCandidate[],
): SearchProvider {
  const snapshot = Object.freeze([...candidates]);
  return Object.freeze({
    providerId: "host-commands",
    async *search(
      _query: string,
      signal: AbortSignal,
    ): AsyncIterable<SearchProviderBatch> {
      // Stop before exposing any result when the owning session is already gone.
      signal.throwIfAborted();
      await Promise.resolve();
      yield Object.freeze({ revision: 1, candidates: snapshot });
    },
  });
}

/**
 * Creates the platform-independent search session coordinator.
 *
 * @param providers The bounded Provider set composed by the trusted host.
 * @returns A coordinator with one active session and explicit cleanup evidence.
 */
export function createSearchApplication(
  providers: readonly SearchProvider[],
): SearchApplication {
  let generation = 0;
  let active:
    | {
        readonly sessionId: string;
        readonly generation: number;
        readonly controller: AbortController;
      }
    | undefined;
  let activeProviderTaskCount = 0;

  const application: SearchApplication = {
    start(
      sessionId: string,
      query: string,
      onEvent: (event: SearchSessionEvent) => void | Promise<void>,
      ownerSignal: AbortSignal,
    ): SearchSessionHandle {
      if (Array.from(query).length > 256) {
        throw new RangeError("search.queryTooLong");
      }

      // A replacement becomes current before the old abort propagates, so late batches fail generation checks.
      generation += 1;
      const sessionGeneration = generation;
      active?.controller.abort("search-session-replaced");
      const controller = new AbortController();
      active = { sessionId, generation: sessionGeneration, controller };
      let sequence = 0;
      let aggregateRevision = 0;
      const providerCandidates = new Map<string, readonly SearchCandidate[]>();
      const emit = async (event: SearchSessionEventPayload): Promise<void> => {
        if (
          active?.generation !== sessionGeneration ||
          controller.signal.aborted
        ) {
          return;
        }
        sequence += 1;
        await onEvent({ ...event, sessionId, sequence } as SearchSessionEvent);
      };
      const abortFromOwner = (): void => {
        controller.abort(ownerSignal.reason);
      };
      ownerSignal.addEventListener("abort", abortFromOwner, { once: true });
      const runProvider = async (provider: SearchProvider): Promise<void> => {
        activeProviderTaskCount += 1;
        try {
          let providerRevision = 0;
          for await (const batch of provider.search(query, controller.signal)) {
            // Reject duplicate or stale Provider revisions before changing the visible aggregate.
            if (
              controller.signal.aborted ||
              active?.generation !== sessionGeneration ||
              batch.revision <= providerRevision
            ) {
              continue;
            }
            providerRevision = batch.revision;
            providerCandidates.set(provider.providerId, batch.candidates);
            aggregateRevision += 1;
            await emit({
              type: "result-batch",
              revision: aggregateRevision,
              results: rankSearchCandidates(
                query,
                Array.from(providerCandidates.values()).flat(),
              ).slice(0, 50),
            });
          }
        } catch (error: unknown) {
          if (!controller.signal.aborted) {
            void error;
            await emit({
              type: "provider-failed",
              providerId: provider.providerId,
              code: "provider.failed",
            });
          }
        } finally {
          activeProviderTaskCount -= 1;
        }
      };

      const runSession = async (): Promise<void> => {
        await emit({ type: "started" });
        await Promise.all(providers.map(runProvider));
        ownerSignal.removeEventListener("abort", abortFromOwner);
        if (active?.generation !== sessionGeneration) {
          return;
        }
        if (controller.signal.aborted) {
          sequence += 1;
          await onEvent({ type: "cancelled", sessionId, sequence });
        } else {
          await emit({ type: "completed" });
        }
        active = undefined;
      };
      void runSession();

      return Object.freeze({
        sessionId,
        cancel(): void {
          if (active?.generation === sessionGeneration) {
            controller.abort("search-session-cancelled");
          }
        },
      });
    },
    getResourceSnapshot(): {
      readonly activeSessionCount: number;
      readonly activeProviderTaskCount: number;
    } {
      return Object.freeze({
        activeSessionCount: active === undefined ? 0 : 1,
        activeProviderTaskCount,
      });
    },
  };
  return Object.freeze(application);
}
