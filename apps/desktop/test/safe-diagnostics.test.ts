import { describe, expect, it } from "vitest";

import {
  createDiagnosticLine,
  diagnosticLimits,
  sanitizeDiagnosticFields,
} from "../src/main/safe-diagnostics.js";

describe("safe diagnostics", () => {
  it("redacts sensitive fields and omits undefined values", () => {
    const marker = "private-marker-must-not-leak";
    const fields = sanitizeDiagnosticFields({
      token: marker,
      requestPayload: marker,
      queryText: marker,
      method: "host.bootstrap.get",
      optional: undefined,
    });
    expect(fields).toEqual({
      token: "[redacted]",
      requestPayload: "[redacted]",
      queryText: "[redacted]",
      method: "host.bootstrap.get",
    });
    expect(JSON.stringify(fields)).not.toContain(marker);
  });

  it("bounds every string field and event name", () => {
    const oversized = "x".repeat(diagnosticLimits.maxFieldLength + 100);
    const line = createDiagnosticLine(oversized, { method: oversized });
    const parsed = JSON.parse(line) as { event: string; method: string };
    expect(parsed.event).toHaveLength(diagnosticLimits.maxFieldLength);
    expect(parsed.method).toHaveLength(diagnosticLimits.maxFieldLength);
  });

  it("drops prototype-sensitive field names without changing object prototypes", () => {
    const fields = JSON.parse(
      '{"__proto__":"unsafe","constructor":"unsafe","prototype":"unsafe","method":"safe"}',
    ) as Record<string, string>;
    const sanitized = sanitizeDiagnosticFields(fields);

    expect(Object.getPrototypeOf(sanitized)).toBeNull();
    expect(sanitized).toEqual({ method: "safe" });
    expect(createDiagnosticLine("safe-event", fields)).toBe(
      '{"event":"safe-event","method":"safe"}',
    );
    expect(Reflect.get({}, "unsafe")).toBeUndefined();
  });
});
