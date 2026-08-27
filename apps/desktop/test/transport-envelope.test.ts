import { describe, expect, it } from "vitest";

import {
  decodeTransportEnvelope,
  transportLimits,
} from "../src/main/transport-envelope.js";

describe("Electron transport envelope", () => {
  it("measures bytes before parsing a valid request", () => {
    const encoded = JSON.stringify({ requestId: "request-1", payload: {} });
    const decoded = decodeTransportEnvelope(encoded);
    expect(decoded).toEqual({
      ok: true,
      request: { requestId: "request-1", payload: {} },
      encodedByteLength: Buffer.byteLength(encoded, "utf8"),
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok && typeof decoded.request === "object") {
      expect(Object.getPrototypeOf(decoded.request)).toBeNull();
      expect(
        Object.getPrototypeOf((decoded.request as { payload: object }).payload),
      ).toBeNull();
    }
  });

  it.each([undefined, null, {}, [], 42])(
    "rejects a non-string IPC argument (%s)",
    (value) => {
      expect(decodeTransportEnvelope(value)).toEqual({
        ok: false,
        code: "protocol.invalidEncoding",
      });
    },
  );

  it("rejects malformed JSON without exposing parser diagnostics", () => {
    expect(decodeTransportEnvelope('{"token":"private-marker"')).toEqual({
      ok: false,
      code: "protocol.invalidEncoding",
    });
  });

  it("rejects an oversized string before JSON parsing", () => {
    const oversized = "{".repeat(transportLimits.maxTransportBytes + 1);
    expect(decodeTransportEnvelope(oversized)).toEqual({
      ok: false,
      code: "protocol.messageTooLarge",
    });
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "rejects the dangerous object key %s at any nesting level",
    (dangerousKey) => {
      const marker = "prototype-pollution-must-not-escape";
      const encoded = `{"requestId":"request-1","payload":{"nested":{"${dangerousKey}":{"polluted":"${marker}"}}}}`;

      expect(decodeTransportEnvelope(encoded)).toEqual({
        ok: false,
        code: "protocol.invalidEncoding",
      });
      expect(Reflect.get(Object.prototype, "polluted")).toBeUndefined();
      expect(Reflect.get({}, "polluted")).toBeUndefined();
    },
  );

  it("enforces the accepted JSON depth, array and string limits", () => {
    const nested = (depth: number): string =>
      depth === 1 ? "{}" : `{"value":${nested(depth - 1)}}`;
    expect(
      decodeTransportEnvelope(nested(transportLimits.maxJsonDepth)),
    ).toMatchObject({ ok: true });
    expect(
      decodeTransportEnvelope(nested(transportLimits.maxJsonDepth + 1)),
    ).toEqual({ ok: false, code: "protocol.invalidEncoding" });
    expect(
      decodeTransportEnvelope(
        JSON.stringify(Array(transportLimits.maxJsonArrayItems).fill(null)),
      ),
    ).toMatchObject({ ok: true });
    expect(
      decodeTransportEnvelope(
        JSON.stringify(Array(transportLimits.maxJsonArrayItems + 1).fill(null)),
      ),
    ).toEqual({ ok: false, code: "protocol.invalidEncoding" });
    expect(
      decodeTransportEnvelope(
        JSON.stringify("x".repeat(transportLimits.maxJsonStringBytes)),
      ),
    ).toMatchObject({ ok: true });
    expect(
      decodeTransportEnvelope(
        JSON.stringify("x".repeat(transportLimits.maxJsonStringBytes + 1)),
      ),
    ).toEqual({ ok: false, code: "protocol.invalidEncoding" });
    expect(
      decodeTransportEnvelope(
        JSON.stringify({
          ["x".repeat(transportLimits.maxJsonStringBytes + 1)]: null,
        }),
      ),
    ).toEqual({ ok: false, code: "protocol.invalidEncoding" });
  });
});
