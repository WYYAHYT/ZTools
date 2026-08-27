import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { _electron as electron } from "@playwright/test";

const repositoryRoot = process.env["ZTOOLS_REPOSITORY_ROOT"];
const electronExecutable = process.env["ZTOOLS_ELECTRON_EXECUTABLE"];
if (repositoryRoot === undefined || electronExecutable === undefined) {
  throw new Error("GNOME window lifecycle smoke environment is incomplete");
}
const desktopDirectory = resolve(repositoryRoot, "apps/desktop");
const userDataDirectory = await mkdtemp(
  resolve(tmpdir(), "ztools-gnome-window-lifecycle-"),
);
const candidate = spawn(
  "/usr/bin/gjs",
  [
    "-c",
    [
      'imports.gi.versions.Gtk = "4.0";',
      "const {Gtk, GLib} = imports.gi;",
      "Gtk.init();",
      'const window = new Gtk.Window({title: "ZTools Disposable Candidate", defaultWidth: 360, defaultHeight: 180});',
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
 * Bounds one asynchronous lifecycle stage and reports its stable failure label.
 *
 * @param operation The operation being observed.
 * @param label The stable stage name included in timeout failures.
 * @param timeoutMs The maximum operation duration.
 * @returns The completed operation value.
 * @throws {Error} When the operation does not settle before its deadline.
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
 * Waits for GTK to confirm that the disposable candidate owns focus.
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
        rejectActive(new Error("disposable candidate exited before focus"));
      };
      output.on("data", onData);
      candidate.once("exit", onExit);
    }),
    "disposable candidate activation",
    5_000,
  );
}

try {
  await waitForCandidateActive();
  if (candidate.exitCode !== null) {
    throw new Error("disposable focus candidate exited before Host launch");
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

  // Destroy the owned candidate and wait until Mutter emits its unmanaged lifecycle.
  candidate.kill("SIGTERM");
  await withTimeout(once(candidate, "exit"), "candidate process exit", 2_000);
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, 100);
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
            new Error("lifecycle hide action was not returned by Host Search"),
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
    "candidate lifecycle action",
    5_000,
  );
  if (
    !outcome.ok ||
    outcome.effectOutcome !== "committed" ||
    outcome.value?.focusResult !== "unavailable" ||
    outcome.value.focusCapability.health.reasonCode !==
      "focus.noPreviousCandidate"
  ) {
    throw new Error(
      `unexpected candidate lifecycle outcome: ${JSON.stringify(outcome)}`,
    );
  }
  console.log("candidate-unmanaged=cleared");
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
