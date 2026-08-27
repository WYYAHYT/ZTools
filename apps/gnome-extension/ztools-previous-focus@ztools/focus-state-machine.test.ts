import { describe, expect, it } from "vitest";

import {
  createFocusStateMachine,
  PROTOCOL_VERSION,
} from "./focus-state-machine.mjs";

const nonce = "host_session_nonce_1234567890";
const epoch = "extension_epoch_1234567890";
type FakeWindow =
  { readonly kind: "host" } | { readonly kind: "app"; alive: boolean };

function request(
  sequence: number,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    sessionNonce: nonce,
    sequence,
    deadlineUnixMs: 10_000,
    ...extra,
  });
}

function fixture() {
  let focused: FakeWindow | null = null;
  const host: FakeWindow = { kind: "host" };
  const app = { kind: "app", alive: true };
  const activated: FakeWindow[] = [];
  const machine = createFocusStateMachine({
    extensionEpoch: epoch,
    isHostWindow: (window: FakeWindow | null) => window?.kind === "host",
    isRestorableWindow: (window: FakeWindow | null) =>
      window?.kind === "app" && window.alive,
    getFocusedWindow: () => focused,
    activateWindow: (window: FakeWindow) => {
      activated.push(window);
      return true;
    },
    now: () => 1_000,
  });
  return {
    machine,
    host,
    app,
    activated,
    setFocused: (window: FakeWindow | null) => (focused = window),
  };
}

describe("GNOME extension focus state machine", () => {
  it("records the last eligible non-host window and restores only it", () => {
    const state = fixture();
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.setFocused(state.host);
    state.machine.observeFocusWindow(state.host);

    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      protocolVersion: 1,
      extensionEpoch: epoch,
      sequence: 1,
      result: "restored",
    });
    expect(state.activated).toEqual([state.app]);
  });

  it("permits one restore during the bounded post-hide focus transition", () => {
    let current = 1_000;
    let focused: FakeWindow | null = null;
    const host: FakeWindow = { kind: "host" };
    const app: FakeWindow = { kind: "app", alive: true };
    const activated: FakeWindow[] = [];
    const machine = createFocusStateMachine({
      extensionEpoch: epoch,
      isHostWindow: (window: FakeWindow | null) => window?.kind === "host",
      isRestorableWindow: (window: FakeWindow | null) =>
        window?.kind === "app" && window.alive,
      getFocusedWindow: () => focused,
      activateWindow: (window: FakeWindow) => {
        activated.push(window);
        return true;
      },
      now: () => current,
    });
    focused = app;
    machine.observeFocusWindow(app);
    focused = host;
    machine.observeFocusWindow(host);
    focused = null;
    machine.observeFocusWindow(null);

    expect(JSON.parse(machine.restore(request(1)))).toMatchObject({
      result: "restored",
    });
    expect(activated).toEqual([app]);

    current += 751;
    expect(JSON.parse(machine.restore(request(2)))).toMatchObject({
      result: "host-not-foreground",
    });
  });

  it("keeps the last eligible candidate across transient system focus", () => {
    const state = fixture();
    const systemWindow = { kind: "system" };
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.setFocused(null);
    state.machine.observeFocusWindow(null);
    state.machine.observeFocusWindow(systemWindow);
    state.setFocused(state.host);
    state.machine.observeFocusWindow(state.host);

    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      result: "restored",
    });
    expect(state.activated).toEqual([state.app]);
  });

  it("rejects malformed, replayed, cross-session and non-foreground requests", () => {
    const state = fixture();
    expect(JSON.parse(state.machine.restore("{}"))).toMatchObject({
      result: "protocol-rejected",
    });
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.setFocused(null);
    expect(
      JSON.parse(state.machine.restore(request(1, { windowId: "forbidden" }))),
    ).toMatchObject({ result: "protocol-rejected" });
    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      result: "host-not-foreground",
    });
    state.setFocused(state.host);
    expect(JSON.parse(state.machine.restore(request(2)))).toMatchObject({
      result: "restored",
    });
    expect(JSON.parse(state.machine.restore(request(2)))).toMatchObject({
      result: "protocol-rejected",
    });
    expect(
      JSON.parse(
        state.machine.restore(
          request(3).replace(nonce, "other_session_nonce_1234567890"),
        ),
      ),
    ).toMatchObject({
      result: "protocol-rejected",
    });
  });

  it("lets a foreground replacement Host revoke a stale nonce from sequence one", () => {
    const state = fixture();
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.setFocused(state.host);
    state.machine.observeFocusWindow(state.host);

    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      result: "restored",
    });
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.setFocused(state.host);
    state.machine.observeFocusWindow(state.host);
    const replacementRequest = request(1).replace(
      nonce,
      "replacement_session_nonce_1234567890",
    );
    expect(JSON.parse(state.machine.restore(replacementRequest))).toMatchObject(
      {
        result: "restored",
      },
    );
    expect(JSON.parse(state.machine.restore(request(2)))).toMatchObject({
      result: "protocol-rejected",
    });
    expect(state.activated).toEqual([state.app, state.app]);
  });

  it("does not let a background replacement nonce displace the active Host", () => {
    const state = fixture();
    state.setFocused(state.host);
    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      result: "no-candidate",
    });
    state.setFocused(state.app);
    const replacementRequest = request(1).replace(
      nonce,
      "replacement_session_nonce_1234567890",
    );
    expect(JSON.parse(state.machine.restore(replacementRequest))).toMatchObject(
      {
        result: "host-not-foreground",
      },
    );
    state.setFocused(state.host);
    expect(JSON.parse(state.machine.restore(request(2)))).toMatchObject({
      result: "no-candidate",
    });
  });

  it("clears candidates when the window becomes invalid and on revoke", () => {
    const state = fixture();
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.app.alive = false;
    state.setFocused(state.host);
    state.machine.observeFocusWindow(state.host);
    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      result: "no-candidate",
    });
    state.machine.revoke();
    expect(JSON.parse(state.machine.restore(request(2)))).toMatchObject({
      result: "protocol-rejected",
    });
  });

  it("invalidates only the candidate whose window lifecycle ended", () => {
    const state = fixture();
    const replacement = { kind: "app" as const, alive: true };
    state.setFocused(state.app);
    state.machine.observeFocusWindow(state.app);
    state.setFocused(replacement);
    state.machine.observeFocusWindow(replacement);

    state.machine.invalidateCandidate(state.app);
    state.setFocused(state.host);
    state.machine.observeFocusWindow(state.host);

    expect(JSON.parse(state.machine.restore(request(1)))).toMatchObject({
      result: "restored",
    });
    expect(state.activated).toEqual([replacement]);
  });

  it("clears the candidate and bounded transition when workspaces change", () => {
    let current = 1_000;
    let focused: FakeWindow | null = null;
    const host: FakeWindow = { kind: "host" };
    const app: FakeWindow = { kind: "app", alive: true };
    const candidateChanges: Array<FakeWindow | null> = [];
    const machine = createFocusStateMachine({
      extensionEpoch: epoch,
      isHostWindow: (window: FakeWindow | null) => window?.kind === "host",
      isRestorableWindow: (window: FakeWindow | null) =>
        window?.kind === "app" && window.alive,
      getFocusedWindow: () => focused,
      activateWindow: () => true,
      onCandidateChanged: (
        _oldWindow: FakeWindow | null,
        newWindow: FakeWindow | null,
      ) => {
        candidateChanges.push(newWindow);
      },
      now: () => current,
    });
    focused = app;
    machine.observeFocusWindow(app);
    focused = host;
    machine.observeFocusWindow(host);
    focused = null;

    machine.invalidateFocusContext();
    current += 1;

    expect(JSON.parse(machine.restore(request(1)))).toMatchObject({
      result: "host-not-foreground",
    });
    expect(candidateChanges).toEqual([app, null]);
  });

  it("enforces an eight-request burst and refills at four per second", () => {
    let current = 1_000;
    const state = fixture();
    const machine = createFocusStateMachine({
      extensionEpoch: epoch,
      isHostWindow: (window: FakeWindow | null) => window?.kind === "host",
      isRestorableWindow: () => false,
      getFocusedWindow: () => state.host,
      activateWindow: () => false,
      now: () => current,
    });
    for (let index = 1; index <= 8; index += 1) {
      expect(JSON.parse(machine.restore(request(index)))).toMatchObject({
        result: "no-candidate",
      });
    }
    expect(JSON.parse(machine.restore(request(9)))).toMatchObject({
      result: "rate-limited",
    });
    current += 250;
    expect(JSON.parse(machine.restore(request(10)))).toMatchObject({
      result: "no-candidate",
    });
  });
});
