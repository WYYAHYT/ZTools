import { Buffer } from "node:buffer";

const MAX_TRANSPORT_BYTES = 64 * 1_024;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_ARRAY_ITEMS = 100;
const MAX_JSON_STRING_BYTES = 8 * 1_024;
const DANGEROUS_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

type SafeJsonValue =
  null | boolean | number | string | SafeJsonArray | SafeJsonObject;

type SafeJsonArray = readonly SafeJsonValue[];

interface SafeJsonObject {
  readonly [key: string]: SafeJsonValue;
}

interface NormalizedJsonValue {
  readonly ok: true;
  readonly value: SafeJsonValue;
}

interface InvalidJsonValue {
  readonly ok: false;
}

export interface DecodedTransportEnvelope {
  readonly ok: true;
  readonly request: unknown;
  readonly encodedByteLength: number;
}

export interface InvalidTransportEnvelope {
  readonly ok: false;
  readonly code: "protocol.invalidEncoding" | "protocol.messageTooLarge";
}

/**
 * Rebuilds parsed JSON without inherited object state and enforces structural limits.
 *
 * @param value The untrusted value returned by JSON.parse.
 * @param depth The current object/array nesting depth, starting at one.
 * @returns A safe JSON tree or a rejection for dangerous keys and excessive structure.
 */
function normalizeJsonValue(
  value: unknown,
  depth: number,
): NormalizedJsonValue | InvalidJsonValue {
  if (value === null || typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8") <= MAX_JSON_STRING_BYTES
      ? { ok: true, value }
      : { ok: false };
  }
  if (depth > MAX_JSON_DEPTH || typeof value !== "object") {
    return { ok: false };
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_ITEMS) {
      return { ok: false };
    }
    const normalized: SafeJsonValue[] = [];
    for (const item of value) {
      const result = normalizeJsonValue(item, depth + 1);
      if (!result.ok) {
        return result;
      }
      normalized.push(result.value);
    }
    return { ok: true, value: Object.freeze(normalized) };
  }

  const normalized = Object.create(null) as Record<string, SafeJsonValue>;
  for (const [key, item] of Object.entries(value)) {
    if (
      DANGEROUS_OBJECT_KEYS.has(key) ||
      Buffer.byteLength(key, "utf8") > MAX_JSON_STRING_BYTES
    ) {
      return { ok: false };
    }
    const result = normalizeJsonValue(item, depth + 1);
    if (!result.ok) {
      return result;
    }
    normalized[key] = result.value;
  }
  return { ok: true, value: Object.freeze(normalized) };
}

/**
 * Checks and decodes the bounded string envelope received from preload.
 *
 * @param encodedRequest The untrusted IPC argument, which must already be a JSON string.
 * @returns A decoded request with its trusted byte length, or a stable transport error.
 */
export function decodeTransportEnvelope(
  encodedRequest: unknown,
): DecodedTransportEnvelope | InvalidTransportEnvelope {
  if (typeof encodedRequest !== "string") {
    return { ok: false, code: "protocol.invalidEncoding" };
  }
  const encodedByteLength = Buffer.byteLength(encodedRequest, "utf8");
  if (encodedByteLength <= 0 || encodedByteLength > MAX_TRANSPORT_BYTES) {
    return { ok: false, code: "protocol.messageTooLarge" };
  }
  try {
    const normalized = normalizeJsonValue(
      JSON.parse(encodedRequest) as unknown,
      1,
    );
    if (!normalized.ok) {
      return { ok: false, code: "protocol.invalidEncoding" };
    }
    return {
      ok: true,
      request: normalized.value,
      encodedByteLength,
    };
  } catch {
    return { ok: false, code: "protocol.invalidEncoding" };
  }
}

export const transportLimits = Object.freeze({
  maxTransportBytes: MAX_TRANSPORT_BYTES,
  maxJsonDepth: MAX_JSON_DEPTH,
  maxJsonArrayItems: MAX_JSON_ARRAY_ITEMS,
  maxJsonStringBytes: MAX_JSON_STRING_BYTES,
});
