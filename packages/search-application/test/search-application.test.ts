import { describe, expect, it } from "vitest";

import type { SearchCandidate } from "@ztools/search-domain";
import {
  createInMemorySearchProvider,
  createSearchApplication,
  type SearchProvider,
  type SearchSessionEvent,
} from "../src/index.js";

const settings: SearchCandidate = {
  providerId: "host-commands",
  providerPriority: 10,
  resultId: "host:open-settings",
  commandId: "open-settings",
  title: "打开设置",
  description: "查看 ZTools 设置",
  keywords: ["设置", "setting"],
  actionId: "host-action:open-settings",
};

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("Search Application", () => {
  it("emits a deterministic local batch and releases its session", async () => {
    const events: SearchSessionEvent[] = [];
    const application = createSearchApplication([
      createInMemorySearchProvider([settings]),
    ]);
    application.start(
      "session-1",
      "设置",
      (event) => {
        events.push(event);
      },
      new AbortController().signal,
    );
    await settle();

    expect(events.map(({ type }) => type)).toEqual([
      "started",
      "result-batch",
      "completed",
    ]);
    expect(events.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(application.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      activeProviderTaskCount: 0,
    });
  });

  it("cancels a replaced session and drops its late result", async () => {
    let releaseOld: (() => void) | undefined;
    const slowProvider: SearchProvider = {
      providerId: "slow",
      async *search(query: string): AsyncIterable<{
        revision: number;
        candidates: readonly SearchCandidate[];
      }> {
        if (query === "旧") {
          await new Promise<void>((resolve) => {
            releaseOld = resolve;
          });
        }
        yield { revision: 1, candidates: [settings] };
      },
    };
    const oldEvents: SearchSessionEvent[] = [];
    const newEvents: SearchSessionEvent[] = [];
    const application = createSearchApplication([slowProvider]);
    application.start(
      "old-session",
      "旧",
      (event) => {
        oldEvents.push(event);
      },
      new AbortController().signal,
    );
    await settle();
    application.start(
      "new-session",
      "设置",
      (event) => {
        newEvents.push(event);
      },
      new AbortController().signal,
    );
    releaseOld?.();
    await settle();
    await settle();

    expect(oldEvents.map(({ type }) => type)).toEqual(["started"]);
    expect(newEvents.map(({ type }) => type)).toEqual([
      "started",
      "result-batch",
      "completed",
    ]);
    expect(application.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      activeProviderTaskCount: 0,
    });
  });

  it("isolates a Provider failure and completes remaining work", async () => {
    const failingProvider: SearchProvider = {
      providerId: "failing",
      search(): AsyncIterable<never> {
        return {
          [Symbol.asyncIterator](): AsyncIterator<never> {
            return {
              async next(): Promise<IteratorResult<never>> {
                await Promise.resolve();
                throw new Error("private provider detail");
              },
            };
          },
        };
      },
    };
    const events: SearchSessionEvent[] = [];
    createSearchApplication([
      failingProvider,
      createInMemorySearchProvider([settings]),
    ]).start(
      "session-1",
      "设置",
      (event) => {
        events.push(event);
      },
      new AbortController().signal,
    );
    await settle();

    expect(events.some(({ type }) => type === "provider-failed")).toBe(true);
    expect(events.some(({ type }) => type === "result-batch")).toBe(true);
    expect(events.at(-1)?.type).toBe("completed");
    expect(JSON.stringify(events)).not.toContain("private provider detail");
  });

  it("cancels when its trusted owner is revoked", async () => {
    const owner = new AbortController();
    const waitingProvider: SearchProvider = {
      providerId: "waiting",
      search(_query: string, signal: AbortSignal): AsyncIterable<never> {
        return {
          [Symbol.asyncIterator](): AsyncIterator<never> {
            return {
              async next(): Promise<IteratorResult<never>> {
                if (signal.aborted) {
                  return { done: true, value: undefined };
                }
                await new Promise<void>((resolve) => {
                  signal.addEventListener(
                    "abort",
                    () => {
                      resolve();
                    },
                    { once: true },
                  );
                });
                return { done: true, value: undefined };
              },
            };
          },
        };
      },
    };
    const events: SearchSessionEvent[] = [];
    const application = createSearchApplication([waitingProvider]);
    application.start(
      "session-1",
      "设置",
      (event) => {
        events.push(event);
      },
      owner.signal,
    );
    owner.abort("connection-revoked");
    await settle();

    expect(events.map(({ type }) => type)).toEqual(["started", "cancelled"]);
    expect(application.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      activeProviderTaskCount: 0,
    });
  });

  it("rejects queries longer than 256 Unicode code points", () => {
    const application = createSearchApplication([]);
    expect(() =>
      application.start(
        "session-1",
        "😀".repeat(257),
        () => {
          return undefined;
        },
        new AbortController().signal,
      ),
    ).toThrow("search.queryTooLong");
  });
});
