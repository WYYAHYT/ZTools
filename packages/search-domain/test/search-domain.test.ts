import { describe, expect, it } from "vitest";

import {
  normalizeSearchText,
  preserveSelection,
  rankSearchCandidates,
  type SearchCandidate,
} from "../src/index.js";

function candidate(
  commandId: string,
  title: string,
  overrides: Partial<SearchCandidate> = {},
): SearchCandidate {
  return {
    providerId: "host",
    providerPriority: 10,
    resultId: `host:${commandId}`,
    commandId,
    title,
    description: "说明",
    keywords: [],
    actionId: `host-action:${commandId}`,
    ...overrides,
  };
}

describe("Search Domain", () => {
  it("normalizes Unicode, case and surrounding whitespace", () => {
    expect(normalizeSearchText("  E\u0301COLE  ")).toBe("école");
  });

  it("orders exact, prefix, token-prefix, substring and subsequence matches", () => {
    const results = rankSearchCandidates("abc", [
      candidate("subsequence", "a-x-b-x-c"),
      candidate("substring", "xabcx"),
      candidate("token-prefix", "x abcdef"),
      candidate("prefix", "abcdef"),
      candidate("exact", "abc"),
    ]);
    expect(results.map(({ commandId }) => commandId)).toEqual([
      "exact",
      "prefix",
      "token-prefix",
      "substring",
      "subsequence",
    ]);
  });

  it("uses keywords and removes duplicate semantic commands", () => {
    const results = rankSearchCandidates("设置", [
      candidate("open-settings", "首选项", { keywords: ["设置"] }),
      candidate("OPEN-SETTINGS", "设置", {
        providerId: "lower-priority",
        providerPriority: 20,
        resultId: "lower:settings",
      }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.resultId).toBe("host:open-settings");
  });

  it("forms a stable total order for otherwise equal results", () => {
    const values = [
      candidate("b", "同名", { resultId: "host:b" }),
      candidate("a", "同名", { resultId: "host:a" }),
    ];
    expect(
      rankSearchCandidates("同", values).map(({ resultId }) => resultId),
    ).toEqual(["host:a", "host:b"]);
  });

  it("preserves selection by result ID and falls back to the prior index", () => {
    const results = [{ resultId: "a" }, { resultId: "b" }, { resultId: "c" }];
    expect(preserveSelection("b", 1, results)).toBe("b");
    expect(preserveSelection("missing", 1, results)).toBe("b");
    expect(preserveSelection("missing", 99, results)).toBe("c");
    expect(preserveSelection("missing", 0, [])).toBeUndefined();
  });
});
