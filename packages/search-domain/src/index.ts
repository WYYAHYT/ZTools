export const matchKinds = [
  "exact",
  "prefix",
  "token-prefix",
  "substring",
  "subsequence",
  "empty-query",
] as const;

export type MatchKind = (typeof matchKinds)[number];

export interface SearchCandidate {
  readonly providerId: string;
  readonly providerPriority: number;
  readonly resultId: string;
  readonly commandId: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly actionId: string;
}

export interface RankedSearchResult extends SearchCandidate {
  readonly normalizedTitle: string;
  readonly dedupeKey: string;
  readonly matchKind: MatchKind;
}

const MATCH_KIND_ORDER: Readonly<Record<MatchKind, number>> = Object.freeze({
  exact: 0,
  prefix: 1,
  "token-prefix": 2,
  substring: 3,
  subsequence: 4,
  "empty-query": 5,
});

/**
 * Produces the deterministic text form used by matching and ordering.
 *
 * @param value The user or Provider supplied text to normalize.
 * @returns NFC text with surrounding whitespace removed and case folded.
 */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("zh-CN");
}

/**
 * Checks whether every query code point occurs in order within a candidate.
 *
 * @param candidate The normalized candidate text.
 * @param query The normalized non-empty query text.
 * @returns True when the query is a subsequence of the candidate.
 */
function isSubsequence(candidate: string, query: string): boolean {
  const candidatePoints = Array.from(candidate);
  const queryPoints = Array.from(query);
  let queryIndex = 0;
  for (const point of candidatePoints) {
    if (point === queryPoints[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === queryPoints.length) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Classifies one normalized searchable value against a normalized query.
 *
 * @param value The normalized title or keyword.
 * @param query The normalized query.
 * @returns The strongest match kind, or undefined when there is no match.
 */
function classifyValue(value: string, query: string): MatchKind | undefined {
  if (query.length === 0) {
    return "empty-query";
  }
  if (value === query) {
    return "exact";
  }
  if (value.startsWith(query)) {
    return "prefix";
  }
  if (
    value
      .split(/[\p{White_Space}\p{Punctuation}]+/u)
      .some((token) => token.startsWith(query))
  ) {
    return "token-prefix";
  }
  if (value.includes(query)) {
    return "substring";
  }
  if (isSubsequence(value, query)) {
    return "subsequence";
  }
  return undefined;
}

/**
 * Finds the strongest title or keyword match for one search candidate.
 *
 * @param candidate The candidate whose bounded text fields are searched.
 * @param query The already-normalized query.
 * @returns The strongest match kind, or undefined when the candidate is excluded.
 */
function classifyCandidate(
  candidate: SearchCandidate,
  query: string,
): MatchKind | undefined {
  let best: MatchKind | undefined;
  for (const value of [candidate.title, ...candidate.keywords]) {
    const match = classifyValue(normalizeSearchText(value), query);
    if (
      match !== undefined &&
      (best === undefined || MATCH_KIND_ORDER[match] < MATCH_KIND_ORDER[best])
    ) {
      best = match;
    }
  }
  return best;
}

/**
 * Compares two ranked results using the accepted stable total order.
 *
 * @param left The first ranked result.
 * @param right The second ranked result.
 * @returns A negative, zero, or positive number suitable for Array.sort.
 */
export function compareRankedResults(
  left: RankedSearchResult,
  right: RankedSearchResult,
): number {
  return (
    MATCH_KIND_ORDER[left.matchKind] - MATCH_KIND_ORDER[right.matchKind] ||
    left.providerPriority - right.providerPriority ||
    left.normalizedTitle.localeCompare(right.normalizedTitle, "zh-CN") ||
    left.resultId.localeCompare(right.resultId, "en")
  );
}

/**
 * Normalizes, matches, deduplicates and sorts untrusted Provider candidates.
 *
 * @param query The user query, limited by the caller contract to 256 code points.
 * @param candidates The candidates already validated at the Provider boundary.
 * @returns Frozen results in deterministic total order.
 */
export function rankSearchCandidates(
  query: string,
  candidates: readonly SearchCandidate[],
): readonly RankedSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const byDedupeKey = new Map<string, RankedSearchResult>();
  for (const candidate of candidates) {
    const matchKind = classifyCandidate(candidate, normalizedQuery);
    if (matchKind === undefined) {
      continue;
    }
    const dedupeKey = normalizeSearchText(candidate.commandId);
    const ranked = Object.freeze({
      ...candidate,
      normalizedTitle: normalizeSearchText(candidate.title),
      dedupeKey,
      matchKind,
    });
    const current = byDedupeKey.get(dedupeKey);
    if (current === undefined || compareRankedResults(ranked, current) < 0) {
      byDedupeKey.set(dedupeKey, ranked);
    }
  }
  return Object.freeze(
    Array.from(byDedupeKey.values()).sort(compareRankedResults),
  );
}

/**
 * Preserves selection by stable identity after an incremental result merge.
 *
 * @param previousResultId The result selected before the update.
 * @param previousIndex The prior visible index used only as a fallback.
 * @param nextResults The newly visible deterministic result list.
 * @returns The next selected result ID, or undefined for an empty list.
 */
export function preserveSelection(
  previousResultId: string | undefined,
  previousIndex: number,
  nextResults: readonly Pick<RankedSearchResult, "resultId">[],
): string | undefined {
  if (nextResults.length === 0) {
    return undefined;
  }
  if (
    previousResultId !== undefined &&
    nextResults.some(({ resultId }) => resultId === previousResultId)
  ) {
    return previousResultId;
  }
  const fallbackIndex = Math.min(
    Math.max(0, previousIndex),
    nextResults.length - 1,
  );
  return nextResults[fallbackIndex]?.resultId;
}
