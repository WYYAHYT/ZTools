import { describe, expect, it } from "vitest";

import {
  createFakeWindowFocusCapability,
  readyHostVisibilitySnapshot,
  unavailablePreviousFocusSnapshot,
  type HideAndRestoreResult,
  type WindowCapabilitySnapshot,
} from "../src/index.js";

const readyFocusSnapshot: WindowCapabilitySnapshot<"host.previous-app-focus"> =
  {
    ...readyHostVisibilitySnapshot,
    capabilityId: "host.previous-app-focus",
  };

const degradedFocusScenarios: readonly {
  readonly name: string;
  readonly snapshot: WindowCapabilitySnapshot<"host.previous-app-focus">;
  readonly focusResult: HideAndRestoreResult["focusResult"];
}[] = [
  {
    name: "unsupported implementation",
    snapshot: unavailablePreviousFocusSnapshot,
    focusResult: "unavailable",
  },
  {
    name: "missing dependency",
    snapshot: {
      ...readyFocusSnapshot,
      dependency: {
        state: "missing",
        reasonCode: "capability.dependencyMissing",
        recoverability: "user-action",
      },
    },
    focusResult: "unavailable",
  },
  {
    name: "restricted system authorization",
    snapshot: {
      ...readyFocusSnapshot,
      systemAuthorization: {
        state: "restricted",
        reasonCode: "capability.systemRestricted",
        recoverability: "user-action",
      },
    },
    focusResult: "restricted",
  },
  {
    name: "runtime failure",
    snapshot: {
      ...readyFocusSnapshot,
      health: {
        state: "unavailable",
        reasonCode: "capability.runtimeUnavailable",
        recoverability: "automatic",
      },
    },
    focusResult: "unavailable",
  },
  {
    name: "revoked caller permission",
    snapshot: {
      ...readyFocusSnapshot,
      permission: {
        state: "revoked",
        reasonCode: "capability.permissionRevoked",
        recoverability: "user-action",
      },
    },
    focusResult: "restricted",
  },
] as const;

describe("Window visibility and previous focus Capability contracts", () => {
  it("exposes independent ready snapshots", () => {
    const capability = createFakeWindowFocusCapability(
      readyHostVisibilitySnapshot,
      readyFocusSnapshot,
      {
        effectOutcome: "committed",
        focusResult: "restored",
        visibilityCapability: readyHostVisibilitySnapshot,
        focusCapability: readyFocusSnapshot,
      },
    );

    expect(capability.getVisibilitySnapshot()).toEqual(
      readyHostVisibilitySnapshot,
    );
    expect(capability.getFocusSnapshot()).toEqual(readyFocusSnapshot);
  });

  it.each(degradedFocusScenarios)(
    "preserves independent focus axes for $name",
    async ({ snapshot, focusResult }) => {
      const capability = createFakeWindowFocusCapability(
        readyHostVisibilitySnapshot,
        readyFocusSnapshot,
        {
          effectOutcome: "committed",
          focusResult,
          visibilityCapability: readyHostVisibilitySnapshot,
          focusCapability: snapshot,
        },
      );

      await expect(capability.hideAndRestorePrevious()).resolves.toEqual({
        effectOutcome: "committed",
        focusResult,
        visibilityCapability: readyHostVisibilitySnapshot,
        focusCapability: snapshot,
      });
      expect(capability.getVisibilitySnapshot()).toEqual(
        readyHostVisibilitySnapshot,
      );
      expect(capability.getFocusSnapshot()).toEqual(snapshot);
    },
  );

  it("does not couple unavailable focus to a committed hide", async () => {
    const capability = createFakeWindowFocusCapability(
      readyHostVisibilitySnapshot,
      unavailablePreviousFocusSnapshot,
      {
        effectOutcome: "committed",
        focusResult: "unavailable",
        visibilityCapability: readyHostVisibilitySnapshot,
        focusCapability: unavailablePreviousFocusSnapshot,
      },
    );

    await expect(capability.hideAndRestorePrevious()).resolves.toMatchObject({
      effectOutcome: "committed",
      focusResult: "unavailable",
      visibilityCapability: { health: { state: "ready" } },
      focusCapability: { health: { state: "unavailable" } },
    });
  });

  it("changes visibility without replacing the independent focus snapshot", async () => {
    const capability = createFakeWindowFocusCapability(
      readyHostVisibilitySnapshot,
      unavailablePreviousFocusSnapshot,
      {
        effectOutcome: "committed",
        focusResult: "unavailable",
        visibilityCapability: readyHostVisibilitySnapshot,
        focusCapability: unavailablePreviousFocusSnapshot,
      },
    );

    await expect(capability.setVisibility("hide")).resolves.toEqual({
      visibility: "hidden",
      effectOutcome: "committed",
      capability: readyHostVisibilitySnapshot,
    });
    expect(capability.getFocusSnapshot()).toEqual(
      unavailablePreviousFocusSnapshot,
    );
  });
});
