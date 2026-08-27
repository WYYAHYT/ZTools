import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const requiredPolicyPatterns = [
  /contextIsolation:\s*true/u,
  /nodeIntegration:\s*false/u,
  /sandbox:\s*true/u,
  /webSecurity:\s*true/u,
] as const;

/**
 * Applies the Gate 1 WebPreferences source assertions.
 *
 * @param source The security policy source under test.
 * @returns True only when every required policy value is fixed securely.
 */
function acceptsSecurityPolicy(source: string): boolean {
  return requiredPolicyPatterns.every((pattern) => pattern.test(source));
}

/**
 * Applies the Gate 1 transport prototype-safety source assertions.
 *
 * @param source The transport decoder source under test.
 * @returns True only when dangerous keys are denied and objects lose inherited state.
 */
function acceptsPrototypeSafeTransport(source: string): boolean {
  return (
    /const DANGEROUS_OBJECT_KEYS = new Set\(\[\s*"__proto__",\s*"constructor",\s*"prototype",/u.test(
      source,
    ) && /Object\.create\(null\)/u.test(source)
  );
}

describe("Electron security verifier regression cases", () => {
  it("rejects each deliberate WebPreferences rollback", async () => {
    const source = await readFile(
      new URL("../src/main/security-policy.ts", import.meta.url),
      "utf8",
    );
    expect(acceptsSecurityPolicy(source)).toBe(true);

    const rollbacks = [
      source.replace("contextIsolation: true", "contextIsolation: false"),
      source.replace("nodeIntegration: false", "nodeIntegration: true"),
      source.replace("sandbox: true", "sandbox: false"),
      source.replace("webSecurity: true", "webSecurity: false"),
    ];
    for (const rollback of rollbacks) {
      expect(acceptsSecurityPolicy(rollback)).toBe(false);
    }
  });

  it("rejects a generic preload invocation surface", () => {
    const genericBridge = "invoke(method, payload)";
    expect(/invoke\(.*method/u.test(genericBridge)).toBe(true);
  });

  it("rejects removal of either transport prototype-safety control", async () => {
    const source = await readFile(
      new URL("../src/main/transport-envelope.ts", import.meta.url),
      "utf8",
    );
    expect(acceptsPrototypeSafeTransport(source)).toBe(true);

    expect(
      acceptsPrototypeSafeTransport(
        source.replace('  "__proto__",', '  "allowed-key",'),
      ),
    ).toBe(false);
    expect(
      acceptsPrototypeSafeTransport(
        source.replace("Object.create(null)", "{}"),
      ),
    ).toBe(false);
  });
});
