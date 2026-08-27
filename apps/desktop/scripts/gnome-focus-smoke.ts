import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { _electron as electron } from "@playwright/test";

const repositoryRoot = process.env["ZTOOLS_REPOSITORY_ROOT"];
if (repositoryRoot === undefined) {
  throw new Error("ZTOOLS_REPOSITORY_ROOT is required");
}
const desktopDirectory = resolve(repositoryRoot, "apps/desktop");
const electronExecutable = process.env["ZTOOLS_ELECTRON_EXECUTABLE"];
if (electronExecutable === undefined) {
  throw new Error("ZTOOLS_ELECTRON_EXECUTABLE is required");
}
const userDataDirectory = await mkdtemp(
  resolve(tmpdir(), "ztools-gnome-focus-e2e-"),
);
const candidate = spawn(
  "/usr/bin/gjs",
  [
    "-c",
    [
      'imports.gi.versions.Gtk = "4.0";',
      "const {Gtk, GLib} = imports.gi;",
      "Gtk.init();",
      'const window = new Gtk.Window({title: "ZTools Focus Candidate", defaultWidth: 360, defaultHeight: 180});',
      'window.connect("notify::is-active", () => { if (window.get_property("is-active")) print("candidate-active"); });',
      "const loop = new GLib.MainLoop(null, false);",
      'window.connect("close-request", () => { loop.quit(); return false; });',
      "window.present();",
      "loop.run();",
    ].join(" "),
  ],
  { env: process.env, stdio: ["ignore", "pipe", "inherit"] },
);
let application: Awaited<ReturnType<typeof electron.launch>> | undefined;

/**
 * Bounds one E2E stage so compositor or IPC stalls report their exact boundary.
 *
 * @param operation The asynchronous stage being observed.
 * @param label The stable stage name included in timeout failures.
 * @param timeoutMs The maximum stage duration.
 * @returns The completed stage value.
 * @throws {Error} When the stage does not settle before its timeout.
 */
async function withTimeout<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs = 3_000,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Waits for GTK to confirm that the candidate owns focus before Host launch.
 *
 * @returns Nothing after the candidate emits its public active-state marker.
 * @throws {Error} When the candidate exits or does not become active in time.
 */
async function waitForCandidateActive(): Promise<void> {
  const output = candidate.stdout;
  output.setEncoding("utf8");
  await withTimeout(
    new Promise<void>((resolveActive, rejectActive) => {
      const cleanup = (): void => {
        output.off("data", onData);
        candidate.off("exit", onExit);
      };
      const onData = (chunk: string): void => {
        if (!chunk.includes("candidate-active")) return;
        cleanup();
        resolveActive();
      };
      const onExit = (): void => {
        cleanup();
        rejectActive(new Error("GNOME focus candidate exited before focus"));
      };
      output.on("data", onData);
      candidate.once("exit", onExit);
    }),
    "GNOME focus candidate activation",
    5_000,
  );
}

try {
  await waitForCandidateActive();
  if (candidate.exitCode !== null) {
    throw new Error("GNOME focus candidate exited before Host launch");
  }

  application = await electron.launch({
    executablePath: electronExecutable,
    args: [
      "--ozone-platform=wayland",
      "--disable-vulkan",
      `--user-data-dir=${userDataDirectory}`,
      ".",
    ],
    cwd: desktopDirectory,
    env: { ...process.env, ZTOOLS_GATE1_E2E: "1" },
  });
  const page = await application.firstWindow();
  await page.getByText("宿主已就绪").waitFor({ state: "visible" });
  await withTimeout(
    application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.focus();
    }),
    "native Host focus",
  );
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, 200);
  });
  const outcome = await withTimeout(
    page.evaluate(async () => {
      const action = await new Promise<{
        readonly sessionId: string;
        readonly actionToken: string;
      }>((resolveAction, rejectAction) => {
        let settled = false;
        let cancelSearch: (() => void) | undefined;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          cancelSearch?.();
          rejectAction(
            new Error("hide action was not returned by Host Search"),
          );
        }, 2_000);
        void window.ztoolsHost
          .startSearch("隐藏", (event) => {
            if (settled || event.type !== "result-batch") return;
            const result = event.results.find(
              ({ actionId }) => actionId === "host-action:hide-ztools",
            );
            if (result === undefined) return;
            settled = true;
            clearTimeout(timeout);
            resolveAction({
              sessionId: event.sessionId,
              actionToken: result.actionToken,
            });
          })
          .then((handle): void => {
            cancelSearch = (): void => {
              handle.cancel();
            };
            if (settled) handle.cancel();
          })
          .catch((error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            rejectAction(
              error instanceof Error
                ? error
                : new Error("Host Search start failed"),
            );
          });
      });
      return window.ztoolsHost.executeAction(
        action.sessionId,
        action.actionToken,
      );
    }),
    "Host search and action",
    5_000,
  );
  const focusHealth = outcome.value?.focusCapability.health;
  if (
    !outcome.ok ||
    outcome.effectOutcome !== "committed" ||
    outcome.value?.focusResult !== "restored" ||
    focusHealth?.state !== "ready"
  ) {
    throw new Error(
      `unexpected focus outcome: ${JSON.stringify({
        ok: outcome.ok,
        effectOutcome: outcome.effectOutcome,
        focusResult: outcome.value?.focusResult,
        healthState: focusHealth?.state,
        reasonCode: focusHealth?.reasonCode,
      })}`,
    );
  }
  console.log("focus-e2e=restored");
} finally {
  if (application !== undefined) {
    try {
      await withTimeout(application.close(), "Electron cleanup", 2_000);
    } catch {
      application.process().kill("SIGKILL");
    }
  }
  candidate.kill("SIGTERM");
  await rm(userDataDirectory, { recursive: true, force: true });
}
