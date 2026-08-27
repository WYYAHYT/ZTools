import { contextBridge, ipcRenderer } from "electron";

interface BootstrapRequest {
  readonly requestId: string;
  readonly method: "host.bootstrap.get";
  readonly version: 1;
  readonly deadlineUnixMs: number;
  readonly payload: Record<never, never>;
}

interface BootstrapResponse {
  readonly ok: boolean;
  readonly category: string;
  readonly effectOutcome: string;
  readonly [key: string]: unknown;
}

interface SearchResult {
  readonly resultId: string;
  readonly title: string;
  readonly description: string;
  readonly actionId: string;
  readonly actionToken: string;
}

type SearchEvent =
  | {
      readonly type: "started";
      readonly sessionId: string;
      readonly sequence: number;
      readonly emittedAtUnixMs: number;
    }
  | {
      readonly type: "result-batch";
      readonly sessionId: string;
      readonly sequence: number;
      readonly emittedAtUnixMs: number;
      readonly revision: number;
      readonly results: readonly SearchResult[];
    }
  | {
      readonly type: "provider-failed";
      readonly sessionId: string;
      readonly sequence: number;
      readonly emittedAtUnixMs: number;
      readonly providerId: string;
      readonly code: string;
    }
  | {
      readonly type: "completed" | "cancelled";
      readonly sessionId: string;
      readonly sequence: number;
      readonly emittedAtUnixMs: number;
    };

interface SearchHandle {
  readonly sessionId: string;

  /**
   * Cancels this search through its fixed, connection-owned IPC method.
   *
   * @returns Nothing after the cancellation request has been sent.
   */
  cancel(): void;
}

interface ActionResponse {
  readonly ok: boolean;
  readonly category: string;
  readonly effectOutcome: string;
  readonly value?: {
    readonly focusResult: string;
    readonly visibilityCapability: {
      readonly capabilityId: string;
      readonly implementation: { readonly state: string };
      readonly dependency: { readonly state: string };
      readonly systemAuthorization: { readonly state: string };
      readonly health: {
        readonly state: string;
        readonly reasonCode?: string;
      };
      readonly permission: { readonly state: string };
    };
    readonly focusCapability: {
      readonly capabilityId: string;
      readonly implementation: { readonly state: string };
      readonly dependency: { readonly state: string };
      readonly systemAuthorization: { readonly state: string };
      readonly health: {
        readonly state: string;
        readonly reasonCode?: string;
      };
      readonly permission: { readonly state: string };
    };
  };
  readonly messageKey?: string;
}

interface VisibilityResponse {
  readonly ok: boolean;
  readonly category: string;
  readonly effectOutcome: string;
  readonly value?: { readonly visibility: "visible" | "hidden" };
  readonly messageKey?: string;
}

export interface HostBridge {
  /**
   * Requests the immutable bootstrap snapshot through the named Host Contract method.
   *
   * @returns A validated Gateway response for the initial Host UI.
   */
  getBootstrap(): Promise<BootstrapResponse>;

  /**
   * Starts a bounded Host Search stream without exposing IPC channel names to the Renderer.
   *
   * @param query The current user query.
   * @param onEvent The Renderer callback receiving only this session's parsed events.
   * @returns A logical handle containing only an opaque ID and cancel method.
   */
  startSearch(
    query: string,
    onEvent: (event: SearchEvent) => void,
  ): Promise<SearchHandle>;

  /**
   * Executes a previously displayed Host action token.
   *
   * @param sessionId The owning search session ID.
   * @param actionToken The opaque token attached to a visible result.
   * @returns The validated action outcome.
   */
  executeAction(
    sessionId: string,
    actionToken: string,
  ): Promise<ActionResponse>;

  /**
   * Requests Host window visibility through the fixed Window Capability contract.
   *
   * @param visibility The desired visibility.
   * @param reason The bounded reason for the transition.
   * @returns The validated visibility outcome.
   */
  setWindowVisibility(
    visibility: "show" | "hide",
    reason: "user-action" | "escape" | "launcher-recall",
  ): Promise<VisibilityResponse>;
}

/**
 * Creates the only Bridge surface exposed to the trusted Host Renderer.
 *
 * @returns A Bridge with no generic method or payload dispatch capability.
 */
export function createHostPreloadBridge(): HostBridge {
  return {
    getBootstrap(): Promise<BootstrapResponse> {
      const request: BootstrapRequest = {
        requestId: crypto.randomUUID(),
        method: "host.bootstrap.get",
        version: 1,
        deadlineUnixMs: Date.now() + 2_000,
        payload: {},
      };
      return ipcRenderer.invoke(
        "ztools.host.bootstrap.get",
        JSON.stringify(request),
      ) as Promise<BootstrapResponse>;
    },
    async startSearch(
      query: string,
      onEvent: (event: SearchEvent) => void,
    ): Promise<SearchHandle> {
      const sessionId = crypto.randomUUID();
      const listener = (
        _event: Electron.IpcRendererEvent,
        encoded: unknown,
      ): void => {
        if (typeof encoded !== "string") {
          return;
        }
        try {
          const searchEvent = JSON.parse(encoded) as SearchEvent;
          if (searchEvent.sessionId !== sessionId) {
            return;
          }
          onEvent(searchEvent);
          if (searchEvent.type === "result-batch") {
            void ipcRenderer.invoke(
              "ztools.host.search.ack",
              JSON.stringify({ sessionId, sequence: searchEvent.sequence }),
            );
          }
          if (
            searchEvent.type === "completed" ||
            searchEvent.type === "cancelled"
          ) {
            ipcRenderer.removeListener("ztools.host.search.event", listener);
          }
        } catch {
          // Malformed Main events are ignored and never forwarded across the Bridge.
        }
      };
      ipcRenderer.on("ztools.host.search.event", listener);
      const response = (await ipcRenderer.invoke(
        "ztools.host.search.start",
        JSON.stringify({ sessionId, query }),
      )) as BootstrapResponse;
      if (!response.ok) {
        ipcRenderer.removeListener("ztools.host.search.event", listener);
        throw new Error(
          typeof response["messageKey"] === "string"
            ? response["messageKey"]
            : "search.startFailed",
        );
      }
      return Object.freeze({
        sessionId,
        cancel(): void {
          ipcRenderer.removeListener("ztools.host.search.event", listener);
          void ipcRenderer.invoke(
            "ztools.host.search.cancel",
            JSON.stringify({ sessionId }),
          );
        },
      });
    },
    executeAction(
      sessionId: string,
      actionToken: string,
    ): Promise<ActionResponse> {
      return ipcRenderer.invoke(
        "ztools.host.action.execute",
        JSON.stringify({ sessionId, actionToken }),
      ) as Promise<ActionResponse>;
    },
    setWindowVisibility(
      visibility: "show" | "hide",
      reason: "user-action" | "escape" | "launcher-recall",
    ): Promise<VisibilityResponse> {
      return ipcRenderer.invoke(
        "ztools.host.window.visibility.set",
        JSON.stringify({ visibility, reason }),
      ) as Promise<VisibilityResponse>;
    },
  };
}

contextBridge.exposeInMainWorld("ztoolsHost", createHostPreloadBridge());
