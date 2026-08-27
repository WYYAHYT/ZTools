import { describe, expect, it } from "vitest";

import { createBootstrapQuery } from "@ztools/bootstrap-application";
import type { ConnectionContext } from "@ztools/contract-kernel";
import { createHostGateway, gatewayLimits } from "../src/index.js";

/**
 * Creates a unique trusted context for resource-pressure scenarios.
 *
 * @param index The deterministic connection sequence number.
 * @returns A cancellable Host Renderer context with a unique identity.
 */
function pressureContext(index: number): ConnectionContext {
  return {
    connectionId: `pressure-connection-${String(index)}`,
    connectionEpoch: index + 1,
    callerRole: "host-renderer",
    protocolVersion: 1,
    signal: new AbortController().signal,
  };
}

/**
 * Creates one valid bootstrap message with a unique request ID.
 *
 * @param index The deterministic request sequence number.
 * @returns A transport message accepted by the Bootstrap Contract.
 */
function pressureRequest(index: number): {
  request: unknown;
  encodedByteLength: number;
} {
  return {
    request: {
      requestId: `pressure-request-${String(index)}`,
      method: "host.bootstrap.get",
      version: 1,
      deadlineUnixMs: Date.now() + gatewayLimits.maxMethodDeadlineMs,
      payload: {},
    },
    encodedByteLength: 160,
  };
}

describe("Host Gateway resource pressure", () => {
  it("survives thousands of connection create-dispatch-revoke cycles", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const cycleCount = gatewayLimits.maxConnectionEpochs * 16;

    for (let index = 0; index < cycleCount; index += 1) {
      const context = pressureContext(index);
      const result = await gateway.dispatch(context, pressureRequest(index));
      expect(result.ok).toBe(true);
      gateway.revoke(context);
      if (index % 256 === 0) {
        await Promise.resolve();
      }
    }

    const finalContext = pressureContext(cycleCount);
    await expect(
      gateway.dispatch(finalContext, pressureRequest(cycleCount)),
    ).resolves.toMatchObject({ ok: true });
    gateway.revoke(finalContext);
    expect(gateway.getResourceSnapshot()).toEqual({
      activeConnectionCount: 0,
      activeRequestCount: 0,
      tombstoneConnectionCount: 0,
      tombstoneCount: 0,
      rateWindowConnectionCount: 0,
      connectionEpochCount: gatewayLimits.maxConnectionEpochs,
    });
  }, 15_000);

  it("bounds history for connections revoked before any request", () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const cycleCount = gatewayLimits.maxConnectionEpochs * 8;
    for (let index = 0; index < cycleCount; index += 1) {
      gateway.revoke(pressureContext(index));
    }
    expect(gateway.getResourceSnapshot()).toEqual({
      activeConnectionCount: 0,
      activeRequestCount: 0,
      tombstoneConnectionCount: 0,
      tombstoneCount: 0,
      rateWindowConnectionCount: 0,
      connectionEpochCount: gatewayLimits.maxConnectionEpochs,
    });
  });

  it("keeps epoch replay protection after bounded history eviction", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const connectionId = "reused-pressure-connection";
    const newest = pressureContext(0);
    const firstContext = { ...newest, connectionId, connectionEpoch: 10 };
    await gateway.dispatch(firstContext, pressureRequest(0));

    for (
      let index = 0;
      index < gatewayLimits.maxConnectionEpochs - 1;
      index += 1
    ) {
      const context = pressureContext(index + 1);
      await gateway.dispatch(context, pressureRequest(index + 1));
      gateway.revoke(context);
    }

    await expect(
      gateway.dispatch(
        { ...firstContext, connectionEpoch: 9 },
        pressureRequest(gatewayLimits.maxConnectionEpochs + 1),
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "connection.staleEpoch",
    });
  });
});
