interface HostBootstrapResponse {
  readonly ok: boolean;
  readonly category: string;
  readonly effectOutcome: string;
  readonly value?: {
    readonly applicationVersion: string;
    readonly protocolVersion: number;
    readonly status: string;
  };
  readonly code?: string;
  readonly messageKey?: string;
}

interface Window {
  readonly ztoolsHost: {
    getBootstrap(): Promise<HostBootstrapResponse>;
    startSearch(
      query: string,
      onEvent: (event: HostSearchEvent) => void,
    ): Promise<HostSearchHandle>;
    executeAction(
      sessionId: string,
      actionToken: string,
    ): Promise<HostActionResponse>;
    setWindowVisibility(
      visibility: "show" | "hide",
      reason: "user-action" | "escape" | "launcher-recall",
    ): Promise<HostVisibilityResponse>;
  };
}

interface HostSearchResult {
  readonly resultId: string;
  readonly title: string;
  readonly description: string;
  readonly actionId: string;
  readonly actionToken: string;
}

type HostSearchEvent =
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
      readonly results: readonly HostSearchResult[];
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

interface HostSearchHandle {
  readonly sessionId: string;
  cancel(): void;
}

interface HostActionResponse {
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

interface HostVisibilityResponse {
  readonly ok: boolean;
  readonly category: string;
  readonly effectOutcome: string;
  readonly value?: { readonly visibility: "visible" | "hidden" };
  readonly messageKey?: string;
}
