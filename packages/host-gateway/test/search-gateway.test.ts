import { describe, expect, it } from "vitest";

import type { ConnectionContext } from "@ztools/contract-kernel";
import type { SearchEvent } from "@ztools/host-contracts";
import {
  createInMemorySearchProvider,
  createSearchApplication,
  type SearchProvider,
} from "@ztools/search-application";
import type { SearchCandidate } from "@ztools/search-domain";
import { createHostSearchGateway, searchGatewayLimits } from "../src/index.js";

const command: SearchCandidate = {
  providerId: "host-commands",
  providerPriority: 10,
  resultId: "host:settings",
  commandId: "settings",
  title: "打开设置",
  description: "查看 ZTools 设置",
  keywords: ["设置"],
  actionId: "host-action:settings",
};

/**
 * Creates a trusted connection with an independently controlled lifecycle.
 *
 * @param connectionId The unique trusted connection identifier.
 * @returns A context and controller used by connection revocation tests.
 */
function context(connectionId: string): {
  readonly value: ConnectionContext;
  readonly controller: AbortController;
} {
  const controller = new AbortController();
  return {
    controller,
    value: {
      connectionId,
      connectionEpoch: 1,
      callerRole: "host-renderer",
      protocolVersion: 1,
      signal: controller.signal,
    },
  };
}

/**
 * Waits for queued async Provider and stream work without fixed long sleeps.
 *
 * @returns Nothing after two event-loop turns.
 */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("Host Search Gateway", () => {
  it("validates input and emits schema-bounded events", async () => {
    const connection = context("connection-1");
    const events: SearchEvent[] = [];
    const gateway = createHostSearchGateway(
      createSearchApplication([createInMemorySearchProvider([command])]),
    );

    expect(
      gateway.start(
        connection.value,
        { sessionId: "session-1", query: "设置" },
        (event) => events.push(event),
      ),
    ).toMatchObject({ ok: true });
    await settle();

    expect(events.map(({ type }) => type)).toEqual([
      "started",
      "result-batch",
      "completed",
    ]);
    expect(events.every(({ emittedAtUnixMs }) => emittedAtUnixMs > 0)).toBe(
      true,
    );
    const batch = events.find(({ type }) => type === "result-batch");
    expect(batch?.type === "result-batch" ? batch.results : []).toHaveLength(1);
    expect(gateway.getResourceSnapshot()).toEqual({
      activeSessionCount: 1,
      unackedBatchCount: 1,
      capacityWaiterCount: 0,
    });
    expect(
      gateway.ack(connection.value, { sessionId: "session-1", sequence: 2 }),
    ).toMatchObject({ ok: true });
    expect(gateway.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      unackedBatchCount: 0,
      capacityWaiterCount: 0,
    });
  });

  it("rejects unknown fields, oversized queries and cross-connection control", async () => {
    const owner = context("owner");
    const attacker = context("attacker");
    const gateway = createHostSearchGateway(
      createSearchApplication([createInMemorySearchProvider([command])]),
    );

    expect(
      gateway.start(
        owner.value,
        { sessionId: "bad", query: "", extra: true },
        () => undefined,
      ),
    ).toMatchObject({ ok: false, code: "protocol.invalidPayload" });
    expect(
      gateway.start(
        owner.value,
        { sessionId: "long", query: "😀".repeat(257) },
        () => undefined,
      ),
    ).toMatchObject({ ok: false, code: "protocol.queryTooLong" });
    gateway.start(
      owner.value,
      { sessionId: "session-1", query: "设置" },
      () => undefined,
    );
    await settle();

    expect(
      gateway.cancel(attacker.value, { sessionId: "session-1" }),
    ).toMatchObject({ ok: false, code: "permission.sessionOwnerDenied" });
    expect(
      gateway.ack(attacker.value, { sessionId: "session-1", sequence: 2 }),
    ).toMatchObject({ ok: false, code: "permission.streamOwnerDenied" });
    gateway.revoke(owner.value);
    expect(gateway.getResourceSnapshot().activeSessionCount).toBe(0);
  });

  it("bounds unacknowledged batches and resumes after acknowledgement", async () => {
    const provider: SearchProvider = {
      providerId: "incremental",
      async *search(): AsyncIterable<{
        revision: number;
        candidates: readonly SearchCandidate[];
      }> {
        for (let revision = 1; revision <= 6; revision += 1) {
          await Promise.resolve();
          yield { revision, candidates: [command] };
        }
      },
    };
    const connection = context("connection-1");
    const events: SearchEvent[] = [];
    const gateway = createHostSearchGateway(
      createSearchApplication([provider]),
    );
    gateway.start(
      connection.value,
      { sessionId: "session-1", query: "设置" },
      (event) => events.push(event),
    );
    await settle();

    expect(events.filter(({ type }) => type === "result-batch")).toHaveLength(
      searchGatewayLimits.maxUnackedBatches,
    );
    expect(gateway.getResourceSnapshot()).toEqual({
      activeSessionCount: 1,
      unackedBatchCount: 4,
      capacityWaiterCount: 1,
    });

    const firstBatch = events.find(({ type }) => type === "result-batch");
    expect(firstBatch).toBeDefined();
    if (firstBatch !== undefined) {
      gateway.ack(connection.value, {
        sessionId: "session-1",
        sequence: firstBatch.sequence,
      });
    }
    await settle();
    expect(events.filter(({ type }) => type === "result-batch")).toHaveLength(
      searchGatewayLimits.maxUnackedBatches + 1,
    );
    gateway.revoke(connection.value);
    expect(gateway.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      unackedBatchCount: 0,
      capacityWaiterCount: 0,
    });
  });

  it("releases a stream when its connection signal is revoked", async () => {
    const connection = context("connection-1");
    const gateway = createHostSearchGateway(
      createSearchApplication([createInMemorySearchProvider([command])]),
    );
    gateway.start(
      connection.value,
      { sessionId: "session-1", query: "设置" },
      () => undefined,
    );
    await settle();
    connection.controller.abort("renderer-gone");
    expect(gateway.getResourceSnapshot()).toEqual({
      activeSessionCount: 0,
      unackedBatchCount: 0,
      capacityWaiterCount: 0,
    });
  });
});
