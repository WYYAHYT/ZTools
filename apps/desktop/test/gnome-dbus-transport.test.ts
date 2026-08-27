import { describe, expect, it, vi } from "vitest";

import {
  createGnomeDbusTransport,
  type FixedProcessRunner,
} from "../src/main/gnome-dbus-transport.js";

const request = {
  protocolVersion: 1,
  sessionNonce: "host_session_nonce_1234567890",
  sequence: 1,
  deadlineUnixMs: 2_000,
} as const;

describe("GNOME D-Bus Transport", () => {
  it("uses only the fixed executable, interface and bounded no-shell runner", async () => {
    const run = vi.fn(() =>
      Promise.resolve({
        stdout:
          '(\'{"protocolVersion":1,"extensionEpoch":"extension_epoch_1234567890","sequence":1,"result":"restored"}\',)\n',
      }),
    );
    const transport = createGnomeDbusTransport({ run }, () => 1_000);

    await expect(transport.restore(request)).resolves.toMatchObject({
      result: "restored",
      sequence: 1,
    });
    expect(run).toHaveBeenCalledWith(
      "/usr/bin/gdbus",
      [
        "call",
        "--session",
        "--dest",
        "com.ztools.ZToolsPreviousFocus",
        "--object-path",
        "/com/ztools/ZToolsPreviousFocus",
        "--method",
        "com.ztools.ZToolsPreviousFocus.RestorePreviousFocus",
        "--timeout",
        "1",
        JSON.stringify(request),
      ],
      1_000,
      4_096,
    );
  });

  it("rejects malformed output, expired deadlines and process failures", async () => {
    const malformed: FixedProcessRunner = {
      run: () => Promise.resolve({ stdout: "arbitrary output" }),
    };
    await expect(
      createGnomeDbusTransport(malformed, () => 1_000).restore(request),
    ).rejects.toThrow("invalid GNOME extension GDBus response");

    await expect(
      createGnomeDbusTransport(malformed, () => 2_000).restore(request),
    ).rejects.toThrow("deadline expired");
    await expect(
      createGnomeDbusTransport({
        run: () => Promise.reject(new Error("private process failure")),
      }).probe(),
    ).resolves.toBe(false);
  });

  it("reports ready only for the fixed introspected interface and method", async () => {
    const run = vi.fn(() =>
      Promise.resolve({
        stdout:
          "interface com.ztools.ZToolsPreviousFocus { methods: RestorePreviousFocus; };",
      }),
    );
    await expect(createGnomeDbusTransport({ run }).probe()).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith(
      "/usr/bin/gdbus",
      [
        "introspect",
        "--session",
        "--dest",
        "com.ztools.ZToolsPreviousFocus",
        "--object-path",
        "/com/ztools/ZToolsPreviousFocus",
      ],
      500,
      4_096,
    );
  });
});
