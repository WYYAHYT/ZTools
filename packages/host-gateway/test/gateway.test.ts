import { describe, expect, it, vi } from "vitest";

import { createBootstrapQuery } from "@ztools/bootstrap-application";
import type { BootstrapQuery } from "@ztools/bootstrap-application";
import type { ConnectionContext } from "@ztools/contract-kernel";
import { createHostGateway } from "../src/index.js";

function createContext(
  overrides: Partial<ConnectionContext> = {},
): ConnectionContext {
  return {
    connectionId: "connection-1",
    connectionEpoch: 1,
    callerRole: "host-renderer",
    protocolVersion: 1,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function request(payload: unknown = {}): {
  request: unknown;
  encodedByteLength: number;
} {
  return {
    request: {
      requestId: "request-1",
      method: "host.bootstrap.get",
      version: 1,
      deadlineUnixMs: Date.now() + 2_000,
      payload,
    },
    encodedByteLength: 128,
  };
}

describe("Host Gateway", () => {
  it("dispatches the explicit bootstrap method", async () => {
    const result = await createHostGateway(
      createBootstrapQuery("0.0.0"),
    ).dispatch(createContext(), request());
    expect(result).toMatchObject({
      ok: true,
      category: "success",
      effectOutcome: "not-applicable",
    });
  });

  it("rejects an unknown method before application dispatch", async () => {
    const message = request();
    (message.request as { method: string }).method = "host.anything.get";
    const result = await createHostGateway(
      createBootstrapQuery("0.0.0"),
    ).dispatch(createContext(), message);
    expect(result).toMatchObject({
      ok: false,
      category: "protocol",
      code: "protocol.unknownMethod",
    });
  });

  it("rejects additional payload fields", async () => {
    const result = await createHostGateway(
      createBootstrapQuery("0.0.0"),
    ).dispatch(createContext(), request({ unexpected: true }));
    expect(result).toMatchObject({
      ok: false,
      category: "protocol",
      code: "protocol.invalidPayload",
    });
  });

  it("does not trust a caller role supplied by the payload", async () => {
    const result = await createHostGateway(
      createBootstrapQuery("0.0.0"),
    ).dispatch(
      createContext({ callerRole: "host-renderer" }),
      request({ callerRole: "plugin-worker" }),
    );
    expect(result).toMatchObject({
      ok: false,
      category: "protocol",
      code: "protocol.invalidPayload",
    });
  });

  it("rejects a revoked connection", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const context = createContext();
    gateway.revoke(context);
    const result = await gateway.dispatch(context, request());
    expect(result).toMatchObject({
      ok: false,
      category: "protocol",
      code: "connection.revoked",
    });
  });

  it("allows a newer trusted context when a connection ID is reused", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const original = createContext({ connectionEpoch: 1 });
    gateway.revoke(original);

    await expect(gateway.dispatch(original, request())).resolves.toMatchObject({
      ok: false,
      code: "connection.revoked",
    });
    await expect(
      gateway.dispatch(createContext({ connectionEpoch: 2 }), request()),
    ).resolves.toMatchObject({ ok: true });
  });

  it("does not let a late old-context revoke roll back the newer epoch", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const oldContext = createContext({ connectionEpoch: 1 });
    const newContext = createContext({ connectionEpoch: 2 });
    await expect(
      gateway.dispatch(newContext, request()),
    ).resolves.toMatchObject({
      ok: true,
    });
    gateway.revoke(oldContext);

    await expect(
      gateway.dispatch(createContext({ connectionEpoch: 1 }), {
        ...request(),
        request: { ...(request().request as object), requestId: "late-old" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "connection.staleEpoch",
    });
  });

  it("rejects a stale connection epoch after a newer epoch is observed", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const newer = createContext({ connectionEpoch: 2 });
    await expect(gateway.dispatch(newer, request())).resolves.toMatchObject({
      ok: true,
    });

    const stale = await gateway.dispatch(
      createContext({ connectionEpoch: 1 }),
      request(""),
    );
    expect(stale).toMatchObject({
      ok: false,
      category: "protocol",
      code: "connection.staleEpoch",
    });
  });

  it("rejects an oversized message before parsing it", async () => {
    const result = await createHostGateway(
      createBootstrapQuery("0.0.0"),
    ).dispatch(createContext(), {
      request: "not parsed",
      encodedByteLength: 64 * 1024 + 1,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "protocol.messageTooLarge",
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid encoded message size (%s)",
    async (encodedByteLength) => {
      const result = await createHostGateway(
        createBootstrapQuery("0.0.0"),
      ).dispatch(createContext(), {
        request: {},
        encodedByteLength,
      });
      expect(result).toMatchObject({
        ok: false,
        code: "protocol.messageTooLarge",
      });
    },
  );

  it("rejects an invalid request ID and incompatible protocol version", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const invalidId = request();
    (invalidId.request as { requestId: string }).requestId =
      "request with spaces";
    await expect(
      gateway.dispatch(createContext(), invalidId),
    ).resolves.toMatchObject({
      ok: false,
      code: "protocol.invalidRequest",
    });

    const incompatibleVersion = request();
    (incompatibleVersion.request as { version: number }).version = 2;
    await expect(
      gateway.dispatch(createContext(), incompatibleVersion),
    ).resolves.toMatchObject({
      ok: false,
      code: "protocol.invalidRequest",
    });
  });

  it("rejects an invalid application result without exposing its contents", async () => {
    const secret = "private-result-should-not-leak";
    const invalidBootstrapQuery = {
      getBootstrap: () => Promise.resolve({ secret, status: "not-ready" }),
    } as unknown as BootstrapQuery;
    const gateway = createHostGateway(invalidBootstrapQuery);
    const result = await gateway.dispatch(createContext(), request());
    expect(result).toMatchObject({
      ok: false,
      category: "internal",
      code: "internal.invalidApplicationResult",
      messageKey: "gateway.internalError",
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("allows a request ID again after the tombstone expires", async () => {
    vi.useFakeTimers();
    try {
      const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
      const context = createContext();
      await expect(gateway.dispatch(context, request())).resolves.toMatchObject(
        {
          ok: true,
        },
      );
      vi.advanceTimersByTime(60_001);
      await expect(gateway.dispatch(context, request())).resolves.toMatchObject(
        {
          ok: true,
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects duplicate request IDs while the first request is active", async () => {
    let release: (() => void) | undefined;
    const bootstrapQuery = {
      getBootstrap: async (signal: AbortSignal) => {
        await new Promise<void>((resolve) => {
          release = resolve;
          signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true },
          );
        });
        return {
          applicationVersion: "0.0.0",
          protocolVersion: 1 as const,
          status: "ready" as const,
        };
      },
    };
    const gateway = createHostGateway(bootstrapQuery);
    const context = createContext();
    const first = gateway.dispatch(context, request());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const second = await gateway.dispatch(context, request());
    expect(second).toMatchObject({
      ok: false,
      code: "resource.requestLimit",
    });
    release?.();
    await first;
  });

  it("rejects the seventeenth active request without dispatching it", async () => {
    const releases: Array<() => void> = [];
    const bootstrapQuery = {
      getBootstrap: (signal: AbortSignal) =>
        new Promise<{
          applicationVersion: string;
          protocolVersion: 1;
          status: "ready";
        }>((resolve) => {
          const release = (): void => {
            resolve({
              applicationVersion: "0.0.0",
              protocolVersion: 1,
              status: "ready",
            });
          };
          releases.push(release);
          signal.addEventListener("abort", release, { once: true });
        }),
    };
    const gateway = createHostGateway(bootstrapQuery);
    const context = createContext();
    const active = Array.from({ length: 16 }, (_, index) => {
      const message = request();
      (message.request as { requestId: string }).requestId =
        `active-${String(index)}`;
      return gateway.dispatch(context, message);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const seventeenth = request();
    (seventeenth.request as { requestId: string }).requestId = "active-17";
    await expect(gateway.dispatch(context, seventeenth)).resolves.toMatchObject(
      {
        ok: false,
        category: "rejected",
        code: "resource.requestLimit",
      },
    );

    releases.forEach((release) => {
      release();
    });
    await Promise.all(active);
  });

  it("rejects a burst after twenty accepted requests", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const context = createContext();
    for (let index = 0; index < 20; index += 1) {
      const message = request();
      (message.request as { requestId: string }).requestId =
        `burst-${String(index)}`;
      await expect(gateway.dispatch(context, message)).resolves.toMatchObject({
        ok: true,
      });
    }
    const limited = request();
    (limited.request as { requestId: string }).requestId = "burst-21";
    await expect(gateway.dispatch(context, limited)).resolves.toMatchObject({
      ok: false,
      category: "rejected",
      code: "resource.requestRate",
    });
  });

  it("rejects replay of a completed request ID during the tombstone window", async () => {
    const gateway = createHostGateway(createBootstrapQuery("0.0.0"));
    const context = createContext();
    const first = await gateway.dispatch(context, request());
    expect(first).toMatchObject({ ok: true });

    const replay = await gateway.dispatch(context, request());
    expect(replay).toMatchObject({
      ok: false,
      category: "protocol",
      code: "protocol.requestReplayed",
    });
  });

  it("cancels application work when the connection is revoked", async () => {
    let cancelled = false;
    const bootstrapQuery = {
      getBootstrap: async (signal: AbortSignal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              cancelled = true;
              resolve();
            },
            { once: true },
          );
        });
        signal.throwIfAborted();
        return {
          applicationVersion: "0.0.0",
          protocolVersion: 1 as const,
          status: "ready" as const,
        };
      },
    };
    const gateway = createHostGateway(bootstrapQuery);
    const context = createContext();
    const pending = gateway.dispatch(context, request());
    gateway.revoke(context);
    const result = await pending;
    expect(cancelled).toBe(true);
    expect(result).toMatchObject({ ok: false, category: "cancelled" });
  });

  it("cancels application work when the deadline expires", async () => {
    let cancelled = false;
    const bootstrapQuery = {
      getBootstrap: async (signal: AbortSignal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              cancelled = true;
              resolve();
            },
            { once: true },
          );
        });
        signal.throwIfAborted();
        return {
          applicationVersion: "0.0.0",
          protocolVersion: 1 as const,
          status: "ready" as const,
        };
      },
    };
    const gateway = createHostGateway(bootstrapQuery);
    const base = request();
    const result = await gateway.dispatch(createContext(), {
      request: {
        ...(base.request as object),
        deadlineUnixMs: Date.now() - 1,
      },
      encodedByteLength: base.encodedByteLength,
    });
    expect(cancelled).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      category: "deadline-exceeded",
      code: "request.deadlineExceeded",
    });
  });

  it("caps a caller-supplied deadline at the method maximum", async () => {
    vi.useFakeTimers();
    try {
      const bootstrapQuery = {
        getBootstrap: (signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(new Error("deadline exceeded"));
              },
              { once: true },
            );
          }),
      };
      const gateway = createHostGateway(bootstrapQuery);
      const message = request();
      (message.request as { deadlineUnixMs: number }).deadlineUnixMs =
        Date.now() + 60_000;
      const pending = gateway.dispatch(createContext(), message);
      await vi.advanceTimersByTimeAsync(1_999);
      let settled = false;
      void pending.finally(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({
        ok: false,
        category: "deadline-exceeded",
        code: "request.deadlineExceeded",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
