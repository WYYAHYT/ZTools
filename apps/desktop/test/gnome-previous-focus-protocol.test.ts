import { describe, expect, it, vi } from "vitest";

import {
  createGnomePreviousFocusClient,
  type GnomePreviousFocusRequest,
  type GnomePreviousFocusTransport,
} from "../src/main/gnome-previous-focus-protocol.js";

const sessionNonce = "host_session_nonce_1234567890";
const extensionEpoch = "extension_epoch_1234567890";

/**
 * Creates a transport that echoes the request sequence with a controlled result.
 *
 * @param result The fixed extension result returned by the transport.
 * @returns A transport mock and its recorded restore method.
 */
function transportWithResult(result: string): {
  readonly transport: GnomePreviousFocusTransport;
  readonly restore: ReturnType<typeof vi.fn>;
} {
  const restore = vi.fn((request: GnomePreviousFocusRequest) =>
    Promise.resolve({
      protocolVersion: 1,
      extensionEpoch,
      sequence: request.sequence,
      result,
    }),
  );
  return { transport: { restore }, restore };
}

describe("GNOME Previous Focus protocol", () => {
  it("emits a target-free, monotonic request and maps restored", async () => {
    const fixture = transportWithResult("restored");
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      fixture.transport,
      () => 1_000,
    );

    await expect(client.restore(2_000)).resolves.toEqual({
      ok: true,
      focusResult: "restored",
    });
    await expect(client.restore(2_000)).resolves.toEqual({
      ok: true,
      focusResult: "restored",
    });
    expect(fixture.restore.mock.calls).toEqual([
      [
        {
          protocolVersion: 1,
          sessionNonce,
          sequence: 1,
          deadlineUnixMs: 2_000,
        },
      ],
      [
        {
          protocolVersion: 1,
          sessionNonce,
          sequence: 2,
          deadlineUnixMs: 2_000,
        },
      ],
    ]);
  });

  it.each([
    ["no-candidate", "unavailable", "focus.noPreviousCandidate"],
    ["candidate-invalid", "unavailable", "focus.previousCandidateInvalid"],
    ["host-not-foreground", "restricted", "focus.hostNotForeground"],
    ["rate-limited", "restricted", "focus.extensionRateLimited"],
    ["protocol-rejected", "restricted", "focus.extensionProtocolRejected"],
  ] as const)(
    "maps %s without exposing GNOME window metadata",
    async (result, focusResult, reasonCode) => {
      const fixture = transportWithResult(result);
      const client = createGnomePreviousFocusClient(
        sessionNonce,
        fixture.transport,
        () => 1_000,
      );

      await expect(client.restore(2_000)).resolves.toEqual({
        ok: true,
        focusResult,
        reasonCode,
      });
    },
  );

  it("rejects expired deadlines before calling the transport", async () => {
    const fixture = transportWithResult("restored");
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      fixture.transport,
      () => 1_000,
    );

    await expect(client.restore(1_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.deadlineExpired",
    });
    expect(fixture.restore).not.toHaveBeenCalled();
  });

  it("enforces a local burst of 8 and refills at 4 requests per second", async () => {
    let currentUnixMs = 1_000;
    const fixture = transportWithResult("restored");
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      fixture.transport,
      () => currentUnixMs,
    );

    for (let index = 0; index < 8; index += 1) {
      await expect(client.restore(10_000)).resolves.toMatchObject({ ok: true });
    }
    await expect(client.restore(10_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.rateLimited",
    });
    currentUnixMs += 250;
    await expect(client.restore(10_000)).resolves.toMatchObject({ ok: true });
  });

  it("rejects unknown fields, wrong sequence and transport failures", async () => {
    const responses: unknown[] = [
      {
        protocolVersion: 1,
        extensionEpoch,
        sequence: 1,
        result: "restored",
        windowId: "forbidden",
      },
      {
        protocolVersion: 1,
        extensionEpoch,
        sequence: 99,
        result: "restored",
      },
    ];
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      {
        restore: () => Promise.resolve(responses.shift()),
      },
      () => 1_000,
    );

    await expect(client.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.invalidExtensionResponse",
    });
    await expect(client.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.invalidExtensionResponse",
    });

    const failingClient = createGnomePreviousFocusClient(
      sessionNonce,
      { restore: () => Promise.reject(new Error("private D-Bus error")) },
      () => 1_000,
    );
    await expect(failingClient.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.transportFailed",
    });
  });

  it("revokes the session when the extension epoch changes", async () => {
    let epoch = extensionEpoch;
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      {
        restore: (request) =>
          Promise.resolve({
            protocolVersion: 1,
            extensionEpoch: epoch,
            sequence: request.sequence,
            result: "restored",
          }),
      },
      () => 1_000,
    );

    await expect(client.restore(2_000)).resolves.toMatchObject({ ok: true });
    epoch = "replacement_epoch_1234567890";
    await expect(client.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.extensionEpochChanged",
    });
    await expect(client.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.sessionRevoked",
    });
  });

  it("supports explicit Host revocation and rejects weak nonces", async () => {
    const fixture = transportWithResult("restored");
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      fixture.transport,
      () => 1_000,
    );
    client.revoke();
    await expect(client.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.sessionRevoked",
    });
    expect(() =>
      createGnomePreviousFocusClient("weak", fixture.transport),
    ).toThrow("invalid GNOME previous-focus session nonce");
  });

  it("allows only one in-flight restore and rechecks the deadline after transport", async () => {
    let resolveTransport:
      | ((response: {
          protocolVersion: 1;
          extensionEpoch: string;
          sequence: number;
          result: "restored";
        }) => void)
      | undefined;
    let currentUnixMs = 1_000;
    const client = createGnomePreviousFocusClient(
      sessionNonce,
      {
        restore: (request) =>
          new Promise((resolve) => {
            resolveTransport = () => {
              resolve({
                protocolVersion: 1,
                extensionEpoch,
                sequence: request.sequence,
                result: "restored",
              });
            };
          }),
      },
      () => currentUnixMs,
    );

    const pending = client.restore(2_000);
    await expect(client.restore(2_000)).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.requestInProgress",
    });
    currentUnixMs = 2_000;
    resolveTransport?.({
      protocolVersion: 1,
      extensionEpoch,
      sequence: 1,
      result: "restored",
    });
    await expect(pending).resolves.toMatchObject({
      ok: false,
      reasonCode: "focus.deadlineExpired",
    });
  });
});
