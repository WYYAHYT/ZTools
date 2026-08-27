import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

import type { ConnectionContext } from "@ztools/contract-kernel";
import { ActionExecuteOutputSchema } from "@ztools/host-contracts";
import { createHostActionGateway } from "../src/index.js";
import {
  readyHostVisibilitySnapshot,
  unavailablePreviousFocusSnapshot,
  type WindowFocusCapability,
} from "@ztools/platform-capabilities";

/**
 * Creates an active trusted connection for action ownership tests.
 *
 * @param connectionId The trusted connection identifier.
 * @returns An immutable Host Renderer connection context.
 */
function context(connectionId: string): ConnectionContext {
  return Object.freeze({
    connectionId,
    connectionEpoch: 1,
    callerRole: "host-renderer",
    protocolVersion: 1,
    signal: new AbortController().signal,
  });
}

const committedExecutor: WindowFocusCapability = {
  getVisibilitySnapshot: () => readyHostVisibilitySnapshot,
  getFocusSnapshot: () => unavailablePreviousFocusSnapshot,
  setVisibility: (visibility) =>
    Promise.resolve({
      visibility: visibility === "show" ? "visible" : "hidden",
      effectOutcome: "committed",
      capability: readyHostVisibilitySnapshot,
    }),
  hideAndRestorePrevious: () =>
    Promise.resolve({
      effectOutcome: "committed",
      focusResult: "unavailable",
      visibilityCapability: readyHostVisibilitySnapshot,
      focusCapability: unavailablePreviousFocusSnapshot,
    }),
};

describe("Host Action Gateway", () => {
  it("executes only a displayed token owned by the same connection and session", async () => {
    const owner = context("owner");
    const attacker = context("attacker");
    const gateway = createHostActionGateway(committedExecutor);
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 1,
      resultId: "host:hide",
      actionToken: "token_1234567890123456",
      actionId: "host-action:hide-ztools",
    });

    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({
      ok: true,
      effectOutcome: "committed",
      value: {
        focusResult: "unavailable",
        visibilityCapability: {
          capabilityId: "host.launcher-visibility",
          health: { state: "ready" },
        },
        focusCapability: {
          capabilityId: "host.previous-app-focus",
          health: { state: "unavailable" },
        },
      },
    });
    await expect(
      gateway.execute(attacker, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission.actionDenied" });
  });

  it("rejects unknown fields, mismatched sessions and unsupported actions", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway(committedExecutor);
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 1,
      resultId: "host:status",
      actionToken: "token_1234567890123456",
      actionId: "host-action:show-status",
    });

    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
        command: "not-allowed",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "protocol.invalidPayload",
      effectOutcome: "not-started",
      retryability: "never",
    });
    await expect(
      gateway.execute(owner, {
        sessionId: "other-session",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission.actionDenied" });
    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission.actionDenied" });
  });

  it("expires older revision tokens and revokes every token on disconnect", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway(committedExecutor);
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 1,
      resultId: "host:hide",
      actionToken: "old_token_1234567890",
      actionId: "host-action:hide-ztools",
    });
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 2,
      resultId: "host:hide",
      actionToken: "new_token_1234567890",
      actionId: "host-action:hide-ztools",
    });

    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "old_token_1234567890",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission.actionDenied" });
    gateway.revoke(owner);
    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "new_token_1234567890",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission.actionDenied" });
  });

  it("expires every old-session token when a replacement session registers results", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway(committedExecutor);
    gateway.register(owner, {
      sessionId: "old-session",
      revision: 1,
      resultId: "host:hide",
      actionToken: "old_session_token_1234",
      actionId: "host-action:hide-ztools",
    });
    gateway.register(owner, {
      sessionId: "new-session",
      revision: 1,
      resultId: "host:hide",
      actionToken: "new_session_token_1234",
      actionId: "host-action:hide-ztools",
    });

    await expect(
      gateway.execute(owner, {
        sessionId: "old-session",
        actionToken: "old_session_token_1234",
      }),
    ).resolves.toMatchObject({ ok: false, code: "permission.actionDenied" });
    await expect(
      gateway.execute(owner, {
        sessionId: "new-session",
        actionToken: "new_session_token_1234",
      }),
    ).resolves.toMatchObject({ ok: true, effectOutcome: "committed" });
  });

  it("does not report an unknown hide outcome as success", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway({
      getVisibilitySnapshot: () => readyHostVisibilitySnapshot,
      getFocusSnapshot: () => unavailablePreviousFocusSnapshot,
      setVisibility: (visibility) =>
        Promise.resolve({
          visibility: visibility === "show" ? "visible" : "hidden",
          effectOutcome: "committed",
          capability: readyHostVisibilitySnapshot,
        }),
      hideAndRestorePrevious: () =>
        Promise.resolve({
          effectOutcome: "unknown",
          focusResult: "unavailable",
          visibilityCapability: readyHostVisibilitySnapshot,
          focusCapability: unavailablePreviousFocusSnapshot,
        }),
    });
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 1,
      resultId: "host:hide",
      actionToken: "token_1234567890123456",
      actionId: "host-action:hide-ztools",
    });

    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({
      ok: false,
      effectOutcome: "unknown",
      retryability: "query-status-first",
    });
  });

  it("rejects action output whose Capability snapshots use the wrong IDs", () => {
    const validate = new Ajv({ ownProperties: true }).compile(
      ActionExecuteOutputSchema,
    );

    expect(
      validate({
        effectOutcome: "committed",
        focusResult: "unavailable",
        visibilityCapability: unavailablePreviousFocusSnapshot,
        focusCapability: readyHostVisibilitySnapshot,
      }),
    ).toBe(false);
  });

  it("maps invalid post-dispatch action output to unknown certainty", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway({
      ...committedExecutor,
      hideAndRestorePrevious: () =>
        Promise.resolve({
          effectOutcome: "committed",
          focusResult: "unavailable",
          visibilityCapability: unavailablePreviousFocusSnapshot,
          focusCapability: readyHostVisibilitySnapshot,
        } as never),
    });
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 1,
      resultId: "host:hide",
      actionToken: "token_1234567890123456",
      actionId: "host-action:hide-ztools",
    });

    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "internal.invalidActionResult",
      effectOutcome: "unknown",
      retryability: "query-status-first",
    });
  });

  it("validates and applies only the named visibility contract", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway(committedExecutor);
    await expect(
      gateway.setVisibility(owner, {
        visibility: "hide",
        reason: "escape",
      }),
    ).resolves.toMatchObject({
      ok: true,
      effectOutcome: "committed",
      value: { visibility: "hidden" },
    });
    await expect(
      gateway.setVisibility(owner, {
        visibility: "hide",
        reason: "escape",
        electronMethod: "destroy",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "protocol.invalidPayload",
      effectOutcome: "not-started",
      retryability: "never",
    });
  });

  it("rejects malformed or semantically inconsistent visibility output", async () => {
    const owner = context("owner");
    const malformedGateway = createHostActionGateway({
      ...committedExecutor,
      setVisibility: () =>
        Promise.resolve({
          visibility: "hidden",
          effectOutcome: "committed",
          capability: {
            ...readyHostVisibilitySnapshot,
            capabilityId: "host.previous-app-focus",
          },
        } as never),
    });
    await expect(
      malformedGateway.setVisibility(owner, {
        visibility: "hide",
        reason: "escape",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "internal.invalidVisibilityResult",
      effectOutcome: "unknown",
      retryability: "query-status-first",
    });

    const inconsistentGateway = createHostActionGateway({
      ...committedExecutor,
      setVisibility: () =>
        Promise.resolve({
          visibility: "visible",
          effectOutcome: "committed",
          capability: readyHostVisibilitySnapshot,
        }),
    });
    await expect(
      inconsistentGateway.setVisibility(owner, {
        visibility: "hide",
        reason: "escape",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "internal.inconsistentVisibilityResult",
      effectOutcome: "unknown",
      retryability: "query-status-first",
    });
  });

  it("maps Window Capability Adapter exceptions to stable failures", async () => {
    const owner = context("owner");
    const gateway = createHostActionGateway({
      ...committedExecutor,
      setVisibility: () => Promise.reject(new Error("private platform error")),
      hideAndRestorePrevious: () =>
        Promise.reject(new Error("private platform error")),
    });
    gateway.register(owner, {
      sessionId: "session-1",
      revision: 1,
      resultId: "host:hide",
      actionToken: "token_1234567890123456",
      actionId: "host-action:hide-ztools",
    });

    await expect(
      gateway.setVisibility(owner, {
        visibility: "hide",
        reason: "escape",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "internal.visibilityAdapterFailed",
      effectOutcome: "unknown",
      retryability: "query-status-first",
    });
    await expect(
      gateway.execute(owner, {
        sessionId: "session-1",
        actionToken: "token_1234567890123456",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "internal.actionAdapterFailed",
      effectOutcome: "unknown",
      retryability: "query-status-first",
    });
  });
});
