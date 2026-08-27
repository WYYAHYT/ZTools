import {
  type FocusResult,
  type WindowCapabilitySnapshot,
} from "@ztools/platform-capabilities";

import type {
  GnomePreviousFocusCallResult,
  GnomePreviousFocusClient,
} from "./gnome-previous-focus-protocol.js";

export type GnomePreviousFocusDependencyState =
  | { readonly state: "missing" }
  | { readonly state: "disabled" }
  | { readonly state: "incompatible" }
  | { readonly state: "ready" };

export interface GnomePreviousFocusAdapter {
  /**
   * Reads the current Previous App Focus Capability snapshot.
   *
   * @returns A five-axis snapshot derived from extension dependency and protocol health.
   */
  getSnapshot(): WindowCapabilitySnapshot<"host.previous-app-focus">;

  /**
   * Requests restoration through the protocol only when the dependency is ready.
   *
   * @param deadlineUnixMs The absolute operation deadline.
   * @returns The minimized focus result and updated Capability snapshot.
   */
  restore(deadlineUnixMs: number): Promise<{
    readonly focusResult: FocusResult;
    readonly capability: WindowCapabilitySnapshot<"host.previous-app-focus">;
  }>;

  /**
   * Revokes the underlying protocol session.
   *
   * @returns Nothing after future restore calls become unavailable.
   */
  revoke(): void;
}

/**
 * Creates the dependency axis for a GNOME extension state.
 *
 * @param state The externally observed extension dependency state.
 * @returns The corresponding Capability dependency axis with recovery metadata.
 */
function dependencyAxis(
  state: GnomePreviousFocusDependencyState["state"],
): WindowCapabilitySnapshot["dependency"] {
  switch (state) {
    case "ready":
      return { state: "ready" };
    case "missing":
      return {
        state: "missing",
        reasonCode: "focus.extensionMissing",
        recoverability: "user-action",
      };
    case "disabled":
      return {
        state: "disabled",
        reasonCode: "focus.extensionDisabled",
        recoverability: "user-action",
      };
    case "incompatible":
      return {
        state: "incompatible",
        reasonCode: "focus.extensionIncompatible",
        recoverability: "user-action",
      };
  }
}

/**
 * Creates a GNOME Previous Focus Adapter around the transport-independent protocol client.
 *
 * @param getDependencyState Reads extension presence, enablement and compatibility.
 * @param client The replay-resistant protocol client owned by Electron Main.
 * @returns An Adapter that keeps GNOME details behind the cross-platform Capability snapshot.
 */
export function createGnomePreviousFocusAdapter(
  getDependencyState: () => GnomePreviousFocusDependencyState,
  client: GnomePreviousFocusClient,
): GnomePreviousFocusAdapter {
  let healthOverride:
    WindowCapabilitySnapshot<"host.previous-app-focus">["health"] | undefined;

  /**
   * Builds the current focus snapshot without leaking extension protocol details.
   *
   * @returns The current five-axis Previous App Focus snapshot.
   */
  function snapshot(): WindowCapabilitySnapshot<"host.previous-app-focus"> {
    const dependency = getDependencyState();
    const ready = dependency.state === "ready";
    return {
      capabilityId: "host.previous-app-focus",
      capabilityVersion: 1,
      implementation: { state: "supported" },
      dependency: dependencyAxis(dependency.state),
      systemAuthorization: { state: "not-required" },
      health:
        ready && healthOverride !== undefined
          ? healthOverride
          : ready
            ? { state: "ready" }
            : {
                state: "unavailable",
                reasonCode: "focus.extensionUnavailable",
                recoverability: "user-action",
              },
      permission: { state: "not-applicable" },
    };
  }

  /**
   * Maps protocol failure categories to runtime health without changing implementation support.
   *
   * @param result The minimized protocol call result.
   * @returns The health axis to expose after the call.
   */
  function healthFromResult(
    result: GnomePreviousFocusCallResult,
  ): WindowCapabilitySnapshot<"host.previous-app-focus">["health"] {
    if (result.ok) {
      return result.focusResult === "restored"
        ? { state: "ready" }
        : {
            state: "degraded",
            reasonCode: result.reasonCode ?? "focus.notRestored",
            recoverability: "automatic",
          };
    }
    return {
      state: "unavailable",
      reasonCode: result.reasonCode,
      recoverability: "automatic",
    };
  }

  return Object.freeze({
    getSnapshot(): WindowCapabilitySnapshot<"host.previous-app-focus"> {
      return snapshot();
    },
    async restore(deadlineUnixMs: number): Promise<{
      readonly focusResult: FocusResult;
      readonly capability: WindowCapabilitySnapshot<"host.previous-app-focus">;
    }> {
      if (getDependencyState().state !== "ready") {
        healthOverride = undefined;
        return { focusResult: "unavailable", capability: snapshot() };
      }
      const result = await client.restore(deadlineUnixMs);
      healthOverride = healthFromResult(result);
      return {
        focusResult: result.ok ? result.focusResult : "unavailable",
        capability: snapshot(),
      };
    },
    revoke(): void {
      client.revoke();
      healthOverride = {
        state: "unavailable",
        reasonCode: "focus.sessionRevoked",
        recoverability: "automatic",
      };
    },
  });
}
