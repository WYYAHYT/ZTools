import { describe, expect, it } from "vitest";

import type { ConnectionContext } from "@ztools/contract-kernel";
import type { SearchEvent } from "@ztools/host-contracts";
import {
  createInMemorySearchProvider,
  createSearchApplication,
} from "@ztools/search-application";
import type { SearchCandidate } from "@ztools/search-domain";
import { createHostSearchGateway } from "../src/index.js";

const command: SearchCandidate = {
  providerId: "host-commands",
  providerPriority: 10,
  resultId: "host:hide-ztools",
  commandId: "hide-ztools",
  title: "隐藏 ZTools",
  description: "隐藏主窗口",
  keywords: ["隐藏"],
  actionId: "host-action:hide-ztools",
};

/**
 * Creates a trusted connection used throughout one pressure run.
 *
 * @returns An active immutable Host Renderer connection.
 */
function context(): ConnectionContext {
  return Object.freeze({
    connectionId: "search-pressure-connection",
    connectionEpoch: 1,
    callerRole: "host-renderer",
    protocolVersion: 1,
    signal: new AbortController().signal,
  });
}

/**
 * Yields to all queued search promises without introducing a long fixed wait.
 *
 * @returns Nothing after two event-loop turns.
 */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("Host Search resource pressure", () => {
  it("releases resources after one thousand session replacements", async () => {
    const connection = context();
    const gateway = createHostSearchGateway(
      createSearchApplication([createInMemorySearchProvider([command])]),
    );

    for (let index = 0; index < 1_000; index += 1) {
      gateway.start(
        connection,
        { sessionId: `session-${String(index)}`, query: "隐藏" },
        (event: SearchEvent): void => {
          if (event.type === "result-batch") {
            gateway.ack(connection, {
              sessionId: event.sessionId,
              sequence: event.sequence,
            });
          }
        },
      );
      if (index % 50 === 0) {
        await Promise.resolve();
      }
    }
    await settle();
    gateway.revoke(connection);

    expect(gateway.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      unackedBatchCount: 0,
      capacityWaiterCount: 0,
    });
  }, 15_000);

  it("keeps local first-batch p95 below the accepted 100ms target", async () => {
    const commands: SearchCandidate[] = Array.from(
      { length: 2_000 },
      (_, index) => ({
        providerId: "host-commands",
        providerPriority: 10,
        resultId: `host:command-${String(index)}`,
        commandId: `command-${String(index)}`,
        title: `命令 ${String(index)}`,
        description: "固定性能数据集",
        keywords: [`keyword-${String(index)}`],
        actionId: "host-action:hide-ztools",
      }),
    );
    const application = createSearchApplication([
      createInMemorySearchProvider(commands),
    ]);
    const samples: number[] = [];

    for (let index = 0; index < 100; index += 1) {
      const startedAt = performance.now();
      await new Promise<void>((resolve) => {
        application.start(
          `performance-${String(index)}`,
          `keyword-${String(index)}`,
          (event) => {
            if (event.type === "result-batch") {
              samples.push(performance.now() - startedAt);
              resolve();
            }
          },
          new AbortController().signal,
        );
      });
    }

    samples.sort((left, right) => left - right);
    const p95Index = Math.ceil(samples.length * 0.95) - 1;
    expect(samples[p95Index]).toBeLessThanOrEqual(100);
  }, 15_000);
});
