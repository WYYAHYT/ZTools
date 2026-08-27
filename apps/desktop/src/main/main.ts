import { app, BrowserWindow, ipcMain, session } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBootstrapQuery } from "@ztools/bootstrap-application";
import {
  isValidEffectResult,
  type ConnectionContext,
  type EffectKind,
} from "@ztools/contract-kernel";
import type { SearchEvent } from "@ztools/host-contracts";
import {
  createHostActionGateway,
  createHostGateway,
  createHostSearchGateway,
  type RegisteredAction,
} from "@ztools/host-gateway";
import {
  createInMemorySearchProvider,
  createSearchApplication,
} from "@ztools/search-application";
import type { SearchCandidate } from "@ztools/search-domain";
import { createElectronGnomeWindowFocusAdapter } from "./electron-gnome-window-focus-adapter.js";
import { createElectronLauncherAdapter } from "./electron-launcher-adapter.js";
import { createGnomeDbusTransport } from "./gnome-dbus-transport.js";
import { createGnomeDependencyTracker } from "./gnome-dependency-tracker.js";
import { createGnomePreviousFocusAdapter } from "./gnome-previous-focus-adapter.js";
import { createGnomePreviousFocusClient } from "./gnome-previous-focus-protocol.js";
import { isGnomeWaylandRuntime } from "./gnome-runtime.js";
import { createDiagnosticLine } from "./safe-diagnostics.js";
import {
  disableChromiumBackgroundNetworking,
  installHostNetworkPolicy,
} from "./network-policy.js";
import { createHostWebPreferences } from "./security-policy.js";
import { createRendererRecoveryPolicy } from "./renderer-recovery-policy.js";
import { decodeTransportEnvelope } from "./transport-envelope.js";
import { createWindowSearchLifecycle } from "./window-search-lifecycle.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
if (process.platform === "linux") {
  // Keep Wayland app_id aligned with the future installed desktop entry and extension filter.
  app.setDesktopName("com.ztools.ZTools");
  app.commandLine.appendSwitch("class", "com.ztools.ZTools");
}
disableChromiumBackgroundNetworking(app.commandLine);
const applicationVersion = app.getVersion();
const gateway = createHostGateway(createBootstrapQuery(applicationVersion));
const hostCommands: readonly SearchCandidate[] = Object.freeze([
  Object.freeze({
    providerId: "host-commands",
    providerPriority: 10,
    resultId: "host:hide-ztools",
    commandId: "hide-ztools",
    title: "隐藏 ZTools",
    description: "隐藏主窗口并尝试恢复之前使用的应用",
    keywords: ["隐藏", "关闭窗口", "hide"],
    actionId: "host-action:hide-ztools",
  }),
]);
let windowInstance: BrowserWindow | undefined;
let connectionContext: ConnectionContext | undefined;
let connectionEpoch = 0;
const smokeTestEnabled = process.env["ZTOOLS_GATE1_SMOKE"] === "1";
const e2eTestEnabled = process.env["ZTOOLS_GATE1_E2E"] === "1";
const rendererRecoveryE2eEnabled =
  process.env["ZTOOLS_RENDERER_RECOVERY_E2E"] === "1";
let rendererRecoveryInitialCrashTriggered = false;
const launcherAdapter = createElectronLauncherAdapter(() => windowInstance);
const gnomeRuntime = isGnomeWaylandRuntime({
  platform: process.platform,
  sessionType: process.env["XDG_SESSION_TYPE"],
  currentDesktop: process.env["XDG_CURRENT_DESKTOP"],
});
const gnomeTransport = gnomeRuntime ? createGnomeDbusTransport() : undefined;
const gnomeDependencyTracker =
  gnomeTransport === undefined
    ? undefined
    : createGnomeDependencyTracker(gnomeTransport);
const gnomeFocusAdapter =
  gnomeDependencyTracker === undefined
    ? undefined
    : createGnomePreviousFocusAdapter(
        () => gnomeDependencyTracker.getState(),
        createGnomePreviousFocusClient(
          randomBytes(24).toString("base64url"),
          gnomeDependencyTracker.transport,
        ),
      );
const windowFocusAdapter =
  gnomeFocusAdapter === undefined || gnomeDependencyTracker === undefined
    ? launcherAdapter
    : createElectronGnomeWindowFocusAdapter(
        launcherAdapter,
        gnomeFocusAdapter,
        Date.now,
        () => gnomeDependencyTracker.refresh(),
      );
const actionRegistration: {
  register: (context: ConnectionContext, action: RegisteredAction) => void;
} = {
  register(): never {
    throw new Error("Host action registration is not initialized");
  },
};
const searchGateway = createHostSearchGateway(
  createSearchApplication([createInMemorySearchProvider(hostCommands)]),
  {
    createActionToken: () => randomUUID(),
    registerAction: (context, action): void => {
      actionRegistration.register(context, action);
    },
  },
);
const actionGateway = createHostActionGateway(windowFocusAdapter);
actionRegistration.register = (context, action): void => {
  actionGateway.register(context, action);
};
const windowSearchLifecycle = createWindowSearchLifecycle(
  () => connectionContext,
  searchGateway,
);
const ownsSingleInstance = app.requestSingleInstanceLock();
let pendingSecondInstanceRecall = false;

/**
 * Emits a payload-free lifecycle event for security diagnostics and E2E synchronization.
 *
 * @param event The stable lifecycle event name.
 * @param epoch The non-secret window connection epoch.
 * @returns Nothing after the structured event has been written.
 */
function logConnectionLifecycle(event: string, epoch: number): void {
  console.log(createDiagnosticLine(event, { connectionEpoch: epoch }));
}

/**
 * Emits aggregate Search Gateway ownership counts without query or result data.
 *
 * @param event The stable resource lifecycle event name.
 * @param reason The bounded trusted lifecycle reason.
 * @param epoch The connection epoch associated with the lifecycle transition.
 * @returns Nothing after the payload-free resource snapshot is written.
 */
function logSearchResources(
  event: string,
  reason: string,
  epoch: number,
): void {
  const resources = searchGateway.getResourceSnapshot();
  console.log(
    createDiagnosticLine(event, {
      reason,
      connectionEpoch: epoch,
      activeSessionCount: resources.activeSessionCount,
      unackedBatchCount: resources.unackedBatchCount,
      capacityWaiterCount: resources.capacityWaiterCount,
    }),
  );
}

/**
 * Recalls the owned launcher after a second operating-system launch request.
 *
 * @returns Nothing after recording only the bounded visibility outcome.
 */
async function recallFromSecondInstance(): Promise<void> {
  const result = await windowFocusAdapter.setVisibility("show");
  console.log(
    createDiagnosticLine("ztools.launcher.second-instance", {
      effectOutcome: result.effectOutcome,
      visibility: result.visibility,
      health: result.capability.health.state,
    }),
  );
}

/**
 * Creates the trusted Host Renderer window with an identity-bound, minimal preload bridge.
 *
 * @returns The created BrowserWindow.
 */
function createMainWindow(): BrowserWindow {
  const trustedRendererPath = join(currentDirectory, "../renderer/index.html");
  const recoveryPolicy = createRendererRecoveryPolicy();
  const window = new BrowserWindow({
    width: 820,
    height: 560,
    show: false,
    webPreferences: createHostWebPreferences(
      join(currentDirectory, "preload-bridge.cjs"),
    ),
  });

  const establishConnection = (): void => {
    connectionEpoch += 1;
    const abortController = new AbortController();
    connectionContext = Object.freeze({
      connectionId: randomUUID(),
      connectionEpoch,
      callerRole: "host-renderer",
      protocolVersion: 1,
      signal: abortController.signal,
    });
    logConnectionLifecycle("ztools.connection.established", connectionEpoch);
  };
  establishConnection();

  window.webContents.on("did-finish-load", () => {
    // Only reveal the trusted shell after the renderer document has loaded successfully.
    window.show();
    if (smokeTestEnabled) {
      // Give the Renderer time to complete its real Bootstrap Contract before collecting evidence.
      setTimeout((): void => {
        void window.webContents
          .executeJavaScript(
            "({ ready: document.body.innerText.includes('宿主已就绪'), processType: typeof globalThis.process, requireType: typeof globalThis.require })",
            true,
          )
          .then((evidence: unknown): void => {
            const safeEvidence = evidence as {
              readonly ready?: unknown;
              readonly processType?: unknown;
              readonly requireType?: unknown;
            };
            console.log(
              createDiagnosticLine("ztools-gate1-smoke-ready", {
                sessionType: process.env["XDG_SESSION_TYPE"] ?? "unknown",
                waylandDisplay: process.env["WAYLAND_DISPLAY"] ?? "missing",
                ready: safeEvidence.ready === true,
                processType:
                  typeof safeEvidence.processType === "string"
                    ? safeEvidence.processType
                    : "unknown",
                requireType:
                  typeof safeEvidence.requireType === "string"
                    ? safeEvidence.requireType
                    : "unknown",
              }),
            );
            app.quit();
          })
          .catch((error: unknown): void => {
            void error;
            console.error(createDiagnosticLine("ztools-gate1-smoke-failed"));
            app.exit(1);
          });
      }, 500);
    }
  });

  const revoke = (reason: string): void => {
    if (connectionContext !== undefined) {
      const revokedEpoch = connectionContext.connectionEpoch;
      gateway.revoke(connectionContext);
      searchGateway.revoke(connectionContext);
      actionGateway.revoke(connectionContext);
      connectionContext = undefined;
      logConnectionLifecycle("ztools.connection.revoked", revokedEpoch);
      logSearchResources(
        "ztools.search.connection-cleanup",
        reason,
        revokedEpoch,
      );
    }
  };

  /**
   * Reloads only the packaged Host document after a Renderer crash within a fixed budget.
   *
   * @returns Nothing after recovery starts or the unsafe window is terminated.
   */
  async function recoverTrustedRenderer(): Promise<void> {
    const decision = recoveryPolicy.next();
    if (decision.action === "terminate") {
      console.error(
        createDiagnosticLine("ztools.renderer.recovery-exhausted", {
          attempts: decision.attempts,
        }),
      );
      // Destroy the unusable window before terminating with an explicit recovery failure status.
      window.destroy();
      app.exit(1);
      return;
    }
    console.log(
      createDiagnosticLine("ztools.renderer.recovery-started", {
        attempt: decision.attempt,
      }),
    );
    try {
      // Recovery is restricted to the immutable packaged Host entry point.
      await window.loadFile(trustedRendererPath);
      console.log(
        createDiagnosticLine("ztools.renderer.recovery-completed", {
          attempt: decision.attempt,
        }),
      );
      if (rendererRecoveryE2eEnabled) {
        setTimeout((): void => {
          void window.webContents
            .executeJavaScript(
              "({ ready: document.body.innerText.includes('宿主已就绪'), focused: document.activeElement?.id === 'search-input', bridgeAvailable: window.ztoolsHost !== undefined })",
              true,
            )
            .then((evidence: unknown): void => {
              const safeEvidence = evidence as {
                readonly ready?: unknown;
                readonly focused?: unknown;
                readonly bridgeAvailable?: unknown;
              };
              console.log(
                createDiagnosticLine("ztools.e2e.renderer-recovered", {
                  recovery: decision.attempt,
                  ready: safeEvidence.ready === true,
                  focused: safeEvidence.focused === true,
                  bridgeAvailable: safeEvidence.bridgeAvailable === true,
                }),
              );
              window.webContents.forcefullyCrashRenderer();
            });
        }, 200);
      }
    } catch (error: unknown) {
      void error;
      console.error(
        createDiagnosticLine("ztools.renderer.recovery-failed", {
          attempt: decision.attempt,
        }),
      );
      // A failed trusted-document load has no safe interactive fallback in this slice.
      if (!window.isDestroyed()) window.destroy();
    }
  }
  window.webContents.on("did-start-loading", () => {
    // A new document gets a new identity; the previous document must not retain access.
    revoke("document-replaced");
    establishConnection();
  });
  window.webContents.on("will-navigate", (event): void => {
    event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("render-process-gone", () => {
    revoke("render-process-gone");
    void recoverTrustedRenderer();
  });
  window.webContents.on("destroyed", () => {
    revoke("web-contents-destroyed");
  });
  window.on("hide", (): void => {
    windowSearchLifecycle.onWindowHidden();
    logSearchResources(
      "ztools.search.hidden-cleanup",
      "window-hidden",
      connectionContext?.connectionEpoch ?? 0,
    );
  });
  window.on("closed", () => {
    revoke("window-closed");
    windowInstance = undefined;
  });
  void window.loadFile(trustedRendererPath);
  return window;
}

ipcMain.handle(
  "ztools.host.bootstrap.get",
  (event, encodedRequest: unknown) => {
    const context = connectionContext;
    if (context === undefined || event.sender !== windowInstance?.webContents) {
      return {
        ok: false,
        category: "protocol",
        effectOutcome: "not-applicable",
        code: "connection.invalid",
        messageKey: "gateway.connectionInvalid",
        retryability: "never",
        correlationId: "unknown",
      } as const;
    }
    const envelope = decodeTransportEnvelope(encodedRequest);
    if (!envelope.ok) {
      return {
        ok: false,
        category: "protocol",
        effectOutcome: "not-applicable",
        code: envelope.code,
        messageKey: "gateway.invalidEncoding",
        retryability: "never",
        correlationId: context.connectionId,
      } as const;
    }
    return gateway.dispatch(context, envelope);
  },
);

/**
 * Returns a stable protocol failure for an invalid Renderer connection or transport envelope.
 *
 * @param effect The effect declared by the named IPC method.
 * @param code The stable failure code.
 * @param correlationId The trusted connection ID when one exists.
 * @returns A failure result safe to expose through preload.
 */
function protocolFailure(
  effect: EffectKind,
  code: string,
  correlationId = "unknown",
): object {
  const effectOutcome =
    effect === "read-only" ? "not-applicable" : "not-started";
  if (!isValidEffectResult(effect, "protocol", effectOutcome, "never")) {
    throw new Error("Invalid Electron transport failure combination");
  }
  return {
    ok: false,
    category: "protocol",
    effectOutcome,
    code,
    messageKey: "gateway.invalidEncoding",
    retryability: "never",
    correlationId,
  } as const;
}

/**
 * Resolves and decodes an untrusted search IPC request for the current Host Renderer.
 *
 * @param sender The Electron sender that invoked the named method.
 * @param encodedRequest The bounded JSON string supplied by preload.
 * @param effect The effect declared by the named IPC method.
 * @returns The trusted context and decoded payload, or a stable failure.
 */
function decodeSearchRequest(
  sender: Electron.WebContents,
  encodedRequest: unknown,
  effect: EffectKind = "read-only",
):
  | {
      readonly ok: true;
      readonly context: ConnectionContext;
      readonly payload: unknown;
    }
  | { readonly ok: false; readonly failure: object } {
  const context = connectionContext;
  if (context === undefined || sender !== windowInstance?.webContents) {
    return {
      ok: false,
      failure: protocolFailure(effect, "connection.invalid"),
    };
  }
  const envelope = decodeTransportEnvelope(encodedRequest);
  if (!envelope.ok) {
    return {
      ok: false,
      failure: protocolFailure(effect, envelope.code, context.connectionId),
    };
  }
  return { ok: true, context, payload: envelope.request };
}

ipcMain.handle("ztools.host.search.start", (event, encodedRequest: unknown) => {
  const decoded = decodeSearchRequest(event.sender, encodedRequest);
  if (!decoded.ok) {
    return decoded.failure;
  }
  return searchGateway.start(
    decoded.context,
    decoded.payload,
    (searchEvent: SearchEvent): void => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(
          "ztools.host.search.event",
          JSON.stringify(searchEvent),
        );
        if (e2eTestEnabled && searchEvent.type === "result-batch") {
          // E2E uses this read-only synchronization point before crashing a blocked Renderer.
          logSearchResources(
            "ztools.search.batch-pending",
            "result-batch-emitted",
            decoded.context.connectionEpoch,
          );
          if (
            rendererRecoveryE2eEnabled &&
            !rendererRecoveryInitialCrashTriggered
          ) {
            rendererRecoveryInitialCrashTriggered = true;
            event.sender.forcefullyCrashRenderer();
          }
        }
      }
    },
  );
});

ipcMain.handle(
  "ztools.host.search.cancel",
  (event, encodedRequest: unknown) => {
    const decoded = decodeSearchRequest(event.sender, encodedRequest);
    return decoded.ok
      ? searchGateway.cancel(decoded.context, decoded.payload)
      : decoded.failure;
  },
);

ipcMain.handle("ztools.host.search.ack", (event, encodedRequest: unknown) => {
  const decoded = decodeSearchRequest(event.sender, encodedRequest);
  return decoded.ok
    ? searchGateway.ack(decoded.context, decoded.payload)
    : decoded.failure;
});

ipcMain.handle(
  "ztools.host.action.execute",
  (event, encodedRequest: unknown) => {
    const decoded = decodeSearchRequest(
      event.sender,
      encodedRequest,
      "non-idempotent-write",
    );
    return decoded.ok
      ? actionGateway.execute(decoded.context, decoded.payload)
      : decoded.failure;
  },
);

ipcMain.handle(
  "ztools.host.window.visibility.set",
  (event, encodedRequest: unknown) => {
    const decoded = decodeSearchRequest(
      event.sender,
      encodedRequest,
      "idempotent-write",
    );
    return decoded.ok
      ? actionGateway.setVisibility(decoded.context, decoded.payload)
      : decoded.failure;
  },
);

if (!ownsSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Arguments from the second process are untrusted and unnecessary for launcher recall.
    if (windowInstance === undefined) {
      pendingSecondInstanceRecall = true;
      return;
    }
    void recallFromSecondInstance();
  });
  void app.whenReady().then((): void => {
    installHostNetworkPolicy(session.defaultSession);
    windowInstance = createMainWindow();
    void gnomeDependencyTracker?.refresh();
    if (pendingSecondInstanceRecall) {
      pendingSecondInstanceRecall = false;
      void recallFromSecondInstance();
    }
  });
}

app.on("before-quit", () => {
  gnomeFocusAdapter?.revoke();
});

app.on("window-all-closed", () => {
  app.quit();
});
