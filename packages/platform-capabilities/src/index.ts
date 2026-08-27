export const implementationStates = ["supported", "unsupported"] as const;
export const dependencyStates = [
  "not-required",
  "ready",
  "missing",
  "disabled",
  "incompatible",
] as const;
export const authorizationStates = [
  "not-required",
  "not-determined",
  "granted",
  "denied",
  "restricted",
] as const;
export const healthStates = ["ready", "degraded", "unavailable"] as const;
export const permissionStates = [
  "not-applicable",
  "not-requested",
  "granted",
  "denied",
  "revoked",
] as const;

export type ImplementationState = (typeof implementationStates)[number];
export type DependencyState = (typeof dependencyStates)[number];
export type AuthorizationState = (typeof authorizationStates)[number];
export type HealthState = (typeof healthStates)[number];
export type PermissionState = (typeof permissionStates)[number];

export interface CapabilityAxis<TState extends string> {
  readonly state: TState;
  readonly reasonCode?: string;
  readonly recoverability?: "automatic" | "user-action" | "not-recoverable";
}

export type WindowCapabilityId =
  "host.launcher-visibility" | "host.previous-app-focus";

export interface WindowCapabilitySnapshot<
  TCapabilityId extends WindowCapabilityId = WindowCapabilityId,
> {
  readonly capabilityId: TCapabilityId;
  readonly capabilityVersion: 1;
  readonly implementation: CapabilityAxis<ImplementationState>;
  readonly dependency: CapabilityAxis<DependencyState>;
  readonly systemAuthorization: CapabilityAxis<AuthorizationState>;
  readonly health: CapabilityAxis<HealthState>;
  readonly permission: CapabilityAxis<PermissionState>;
}

export type FocusResult =
  "not-attempted" | "restored" | "restricted" | "unavailable";

export interface HideAndRestoreResult {
  readonly effectOutcome:
    "not-started" | "committed" | "not-committed" | "unknown";
  readonly focusResult: FocusResult;
  readonly visibilityCapability: WindowCapabilitySnapshot<"host.launcher-visibility">;
  readonly focusCapability: WindowCapabilitySnapshot<"host.previous-app-focus">;
}

export interface SetVisibilityResult {
  readonly visibility: "visible" | "hidden";
  readonly effectOutcome: "committed" | "not-committed" | "unknown";
  readonly capability: WindowCapabilitySnapshot<"host.launcher-visibility">;
}

export interface WindowFocusCapability {
  /**
   * Reads the current multi-axis capability state without performing a side effect.
   *
   * @returns A stable capability snapshot for the trusted Host UI.
   */
  getVisibilitySnapshot(): WindowCapabilitySnapshot<"host.launcher-visibility">;

  /**
   * Reads the previous-application focus capability state independently.
   *
   * @returns The current focus restoration capability snapshot.
   */
  getFocusSnapshot(): WindowCapabilitySnapshot<"host.previous-app-focus">;

  /**
   * Changes only the host launcher visibility without attempting focus restoration.
   *
   * @param visibility The desired host launcher visibility.
   * @returns The observed visibility outcome and capability state.
   */
  setVisibility(visibility: "show" | "hide"): Promise<SetVisibilityResult>;

  /**
   * Hides the host launcher and attempts previous-application focus restoration.
   *
   * @returns The observed hide outcome, independent focus result and capability state.
   */
  hideAndRestorePrevious(): Promise<HideAndRestoreResult>;
}

/**
 * Creates a deterministic Fake Window/Focus Capability for application and contract tests.
 *
 * @param initialVisibilitySnapshot The launcher visibility state exposed before calls.
 * @param initialFocusSnapshot The previous-application focus state exposed before calls.
 * @param result The controlled action result returned by the fake.
 * @returns A fake adapter with no platform dependencies.
 */
export function createFakeWindowFocusCapability(
  initialVisibilitySnapshot: WindowCapabilitySnapshot<"host.launcher-visibility">,
  initialFocusSnapshot: WindowCapabilitySnapshot<"host.previous-app-focus">,
  result: HideAndRestoreResult,
): WindowFocusCapability {
  let visibilitySnapshot = Object.freeze(initialVisibilitySnapshot);
  let focusSnapshot = Object.freeze(initialFocusSnapshot);
  return Object.freeze({
    getVisibilitySnapshot(): WindowCapabilitySnapshot<"host.launcher-visibility"> {
      return visibilitySnapshot;
    },
    getFocusSnapshot(): WindowCapabilitySnapshot<"host.previous-app-focus"> {
      return focusSnapshot;
    },
    setVisibility(visibility: "show" | "hide"): Promise<SetVisibilityResult> {
      const result: SetVisibilityResult = {
        visibility: visibility === "show" ? "visible" : "hidden",
        effectOutcome: "committed",
        capability: visibilitySnapshot,
      };
      return Promise.resolve(result);
    },
    hideAndRestorePrevious(): Promise<HideAndRestoreResult> {
      visibilitySnapshot = Object.freeze(result.visibilityCapability);
      focusSnapshot = Object.freeze(result.focusCapability);
      return Promise.resolve(result);
    },
  });
}

export const readyHostVisibilitySnapshot: WindowCapabilitySnapshot<"host.launcher-visibility"> =
  Object.freeze({
    capabilityId: "host.launcher-visibility",
    capabilityVersion: 1,
    implementation: { state: "supported" as const },
    dependency: { state: "not-required" as const },
    systemAuthorization: { state: "not-required" as const },
    health: { state: "ready" as const },
    permission: { state: "not-applicable" as const },
  });

export const unavailableHostVisibilitySnapshot: WindowCapabilitySnapshot<"host.launcher-visibility"> =
  Object.freeze({
    capabilityId: "host.launcher-visibility",
    capabilityVersion: 1,
    implementation: { state: "supported" as const },
    dependency: { state: "not-required" as const },
    systemAuthorization: { state: "not-required" as const },
    health: {
      state: "unavailable" as const,
      reasonCode: "visibility.windowUnavailable",
      recoverability: "automatic" as const,
    },
    permission: { state: "not-applicable" as const },
  });

export const unavailablePreviousFocusSnapshot: WindowCapabilitySnapshot<"host.previous-app-focus"> =
  Object.freeze({
    capabilityId: "host.previous-app-focus",
    capabilityVersion: 1,
    implementation: {
      state: "unsupported" as const,
      reasonCode: "focus.adapterNotImplemented",
      recoverability: "not-recoverable" as const,
    },
    dependency: { state: "not-required" as const },
    systemAuthorization: { state: "not-required" as const },
    health: {
      state: "unavailable" as const,
      reasonCode: "focus.unavailable",
      recoverability: "not-recoverable" as const,
    },
    permission: { state: "not-applicable" as const },
  });
