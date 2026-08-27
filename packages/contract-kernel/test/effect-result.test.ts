import { describe, expect, it } from "vitest";

import {
  effectKinds,
  effectOutcomes,
  isValidEffectResult,
  resultCategories,
  retryabilities,
  type EffectKind,
  type EffectOutcome,
  type ResultCategory,
  type Retryability,
} from "../src/index.js";

interface EffectResultCase {
  readonly effect: EffectKind;
  readonly category: ResultCategory;
  readonly outcome: EffectOutcome;
  readonly retryability: Retryability;
}

/**
 * Defines the accepted ADR-0012 matrix independently from the production validator.
 *
 * @param value One exhaustive effect result tuple.
 * @returns True only for combinations allowed by the accepted certainty model.
 */
function expectedValidity(value: EffectResultCase): boolean {
  const { effect, category, outcome, retryability } = value;
  if (effect === "read-only") {
    if (outcome !== "not-applicable") {
      return false;
    }
    const allowed: Readonly<Record<ResultCategory, readonly Retryability[]>> = {
      success: ["never"],
      rejected: ["never", "after-user-action", "after-state-change"],
      cancelled: ["never"],
      "deadline-exceeded": ["safe-with-backoff"],
      unavailable: [
        "safe-with-backoff",
        "after-user-action",
        "after-state-change",
      ],
      conflict: ["after-state-change"],
      internal: ["never"],
      protocol: ["never"],
    };
    return allowed[category].includes(retryability);
  }

  if (category === "success") {
    return outcome === "committed" && retryability === "never";
  }
  if (outcome === "not-applicable") {
    return false;
  }
  if (outcome === "committed") {
    return (
      ["cancelled", "deadline-exceeded", "unavailable", "internal"].includes(
        category,
      ) && retryability === "never"
    );
  }
  if (outcome === "unknown") {
    return (
      ["cancelled", "deadline-exceeded", "unavailable", "internal"].includes(
        category,
      ) && retryability === "query-status-first"
    );
  }
  if (retryability === "query-status-first") {
    return false;
  }
  if (
    effect === "non-idempotent-write" &&
    retryability === "safe-with-backoff"
  ) {
    return false;
  }
  if (category === "protocol") {
    return outcome === "not-started" && retryability === "never";
  }
  if (category === "rejected") {
    return (
      outcome === "not-started" &&
      ["never", "after-user-action", "after-state-change"].includes(
        retryability,
      )
    );
  }
  if (category === "conflict") {
    return (
      ["not-started", "not-committed"].includes(outcome) &&
      ["never", "after-state-change"].includes(retryability)
    );
  }
  return ["cancelled", "deadline-exceeded", "unavailable", "internal"].includes(
    category,
  );
}

const exhaustiveCases: readonly EffectResultCase[] = effectKinds.flatMap(
  (effect) =>
    resultCategories.flatMap((category) =>
      effectOutcomes.flatMap((outcome) =>
        retryabilities.map((retryability) => ({
          effect,
          category,
          outcome,
          retryability,
        })),
      ),
    ),
);

describe("isValidEffectResult", () => {
  it("matches the accepted matrix for every possible tuple", () => {
    expect(exhaustiveCases).toHaveLength(600);
    for (const value of exhaustiveCases) {
      expect(
        isValidEffectResult(
          value.effect,
          value.category,
          value.outcome,
          value.retryability,
        ),
        JSON.stringify(value),
      ).toBe(expectedValidity(value));
    }
  });

  it("accepts the canonical read, idempotent and non-idempotent examples", () => {
    const valid: readonly EffectResultCase[] = [
      {
        effect: "read-only",
        category: "deadline-exceeded",
        outcome: "not-applicable",
        retryability: "safe-with-backoff",
      },
      {
        effect: "idempotent-write",
        category: "conflict",
        outcome: "not-committed",
        retryability: "after-state-change",
      },
      {
        effect: "non-idempotent-write",
        category: "internal",
        outcome: "unknown",
        retryability: "query-status-first",
      },
    ];
    for (const value of valid) {
      expect(
        isValidEffectResult(
          value.effect,
          value.category,
          value.outcome,
          value.retryability,
        ),
      ).toBe(true);
    }
  });

  it("rejects unsafe retry and contradictory certainty examples", () => {
    const invalid: readonly EffectResultCase[] = [
      {
        effect: "read-only",
        category: "internal",
        outcome: "committed",
        retryability: "never",
      },
      {
        effect: "idempotent-write",
        category: "protocol",
        outcome: "committed",
        retryability: "never",
      },
      {
        effect: "non-idempotent-write",
        category: "unavailable",
        outcome: "not-started",
        retryability: "safe-with-backoff",
      },
      {
        effect: "non-idempotent-write",
        category: "deadline-exceeded",
        outcome: "unknown",
        retryability: "safe-with-backoff",
      },
    ];
    for (const value of invalid) {
      expect(
        isValidEffectResult(
          value.effect,
          value.category,
          value.outcome,
          value.retryability,
        ),
      ).toBe(false);
    }
  });
});
