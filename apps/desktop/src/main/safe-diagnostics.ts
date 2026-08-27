const MAX_DIAGNOSTIC_FIELD_LENGTH = 1_024;
const REDACTED_VALUE = "[redacted]";
const SENSITIVE_FIELD_PATTERN =
  /token|secret|password|authorization|payload|query|content/iu;
const DANGEROUS_FIELD_NAMES = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export type DiagnosticValue = string | number | boolean | null | undefined;

/**
 * Produces a bounded, payload-free field map for structured diagnostics.
 *
 * @param fields The diagnostic fields selected by trusted application code.
 * @returns A new object with sensitive names redacted and strings bounded.
 */
export function sanitizeDiagnosticFields(
  fields: Readonly<Record<string, DiagnosticValue>>,
): Readonly<Record<string, string | number | boolean | null>> {
  const sanitized = Object.create(null) as Record<
    string,
    string | number | boolean | null
  >;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || DANGEROUS_FIELD_NAMES.has(key)) {
      continue;
    }
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      sanitized[key] = REDACTED_VALUE;
      continue;
    }
    sanitized[key] =
      typeof value === "string"
        ? value.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH)
        : value;
  }
  return Object.freeze(sanitized);
}

/**
 * Serializes a stable event with fields that cannot expose request or response payloads.
 *
 * @param event The allowlisted diagnostic event name chosen by trusted code.
 * @param fields The bounded primitive fields associated with the event.
 * @returns A single JSON log line.
 */
export function createDiagnosticLine(
  event: string,
  fields: Readonly<Record<string, DiagnosticValue>> = {},
): string {
  return JSON.stringify({
    event: event.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH),
    ...sanitizeDiagnosticFields(fields),
  });
}

export const diagnosticLimits = Object.freeze({
  maxFieldLength: MAX_DIAGNOSTIC_FIELD_LENGTH,
  redactedValue: REDACTED_VALUE,
});
