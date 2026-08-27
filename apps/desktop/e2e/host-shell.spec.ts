import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

import { waitForChildExit } from "../scripts/child-process-exit.mjs";

const desktopDirectory = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron") as string;

interface HostPageEvidence {
  readonly bridgeKeys: string[];
  readonly processType: string;
  readonly requireType: string;
}

interface LifecycleEvent {
  readonly event: string;
  readonly connectionEpoch: number;
}

interface SearchResourceEvent {
  readonly event:
    | "ztools.search.hidden-cleanup"
    | "ztools.search.batch-pending"
    | "ztools.search.connection-cleanup";
  readonly reason: string;
  readonly connectionEpoch: number;
  readonly activeSessionCount: number;
  readonly unackedBatchCount: number;
  readonly capacityWaiterCount: number;
}

interface SecondInstanceEvent {
  readonly event: "ztools.launcher.second-instance";
  readonly effectOutcome: string;
  readonly visibility: string;
  readonly health: string;
}

interface RendererRecoveryEvidence {
  readonly event: "ztools.e2e.renderer-recovered";
  readonly recovery: number;
  readonly ready: boolean;
  readonly focused: boolean;
  readonly bridgeAvailable: boolean;
}

/**
 * Extracts payload-free connection events from Electron Main output.
 *
 * @param output The collected process output.
 * @returns Parsed lifecycle events, excluding unrelated Electron diagnostics.
 */
function parseLifecycleEvents(output: string): LifecycleEvent[] {
  return output.split(/\r?\n/u).flatMap((line): LifecycleEvent[] => {
    try {
      const value = JSON.parse(line) as Partial<LifecycleEvent>;
      return typeof value.event === "string" &&
        typeof value.connectionEpoch === "number"
        ? [value as LifecycleEvent]
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * Extracts payload-free search cleanup evidence from Electron Main output.
 *
 * @param output The collected process output.
 * @returns Valid cleanup events without query, result or action data.
 */
function parseSearchResourceEvents(output: string): SearchResourceEvent[] {
  return output.split(/\r?\n/u).flatMap((line): SearchResourceEvent[] => {
    try {
      const value = JSON.parse(line) as Partial<SearchResourceEvent>;
      return (value.event === "ztools.search.hidden-cleanup" ||
        value.event === "ztools.search.batch-pending" ||
        value.event === "ztools.search.connection-cleanup") &&
        typeof value.reason === "string" &&
        typeof value.connectionEpoch === "number" &&
        typeof value.activeSessionCount === "number" &&
        typeof value.unackedBatchCount === "number" &&
        typeof value.capacityWaiterCount === "number"
        ? [value as SearchResourceEvent]
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * Extracts the bounded second-instance recall outcome without process arguments.
 *
 * @param output The collected first-instance Main output.
 * @returns Valid launcher recall events.
 */
function parseSecondInstanceEvents(output: string): SecondInstanceEvent[] {
  return output.split(/\r?\n/u).flatMap((line): SecondInstanceEvent[] => {
    try {
      const value = JSON.parse(line) as Partial<SecondInstanceEvent>;
      return value.event === "ztools.launcher.second-instance" &&
        typeof value.effectOutcome === "string" &&
        typeof value.visibility === "string" &&
        typeof value.health === "string"
        ? [value as SecondInstanceEvent]
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * Extracts payload-free Renderer recovery evidence emitted by the E2E observer.
 *
 * @param output The collected Electron Main output.
 * @returns Valid recovery observations without query or result data.
 */
function parseRendererRecoveryEvidence(
  output: string,
): RendererRecoveryEvidence[] {
  return output.split(/\r?\n/u).flatMap((line): RendererRecoveryEvidence[] => {
    try {
      const value = JSON.parse(line) as Partial<RendererRecoveryEvidence>;
      return value.event === "ztools.e2e.renderer-recovered" &&
        typeof value.recovery === "number" &&
        typeof value.ready === "boolean" &&
        typeof value.focused === "boolean" &&
        typeof value.bridgeAvailable === "boolean"
        ? [value as RendererRecoveryEvidence]
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * Waits for a rejected Electron process to exit without leaking a timeout timer.
 *
 * @param process The second Electron process that must yield to the lock owner.
 * @returns Nothing after a normal zero-code exit.
 * @throws {Error} When the process hangs or exits abnormally.
 */
async function waitForSecondInstanceExit(
  process: ReturnType<typeof spawn>,
): Promise<void> {
  const { code, signal, timedOut } = await waitForChildExit(process, 3_000);
  if (timedOut) {
    throw new Error("second Electron instance did not exit before timeout");
  }
  if (code !== 0 || signal !== null) {
    throw new Error(
      `second Electron instance exited abnormally: code=${String(code)} signal=${String(signal)}`,
    );
  }
}

/**
 * Adds the Linux-only Chromium flag required by independently spawned E2E
 * processes on hosted runners.
 *
 * @returns Additional arguments for the manually spawned Electron process.
 */
function getSpawnedElectronArguments(): string[] {
  return process.platform === "linux" ? ["--no-sandbox"] : [];
}

/**
 * Describes the expected previous-application focus state for the runner.
 *
 * @returns The capability summary exposed by the current platform runtime.
 */
function getExpectedFocusCapabilitySummary(): string {
  const isGnomeWayland =
    process.platform === "linux" &&
    process.env["XDG_SESSION_TYPE"]?.toLowerCase() === "wayland" &&
    (process.env["XDG_CURRENT_DESKTOP"]
      ?.toLowerCase()
      .split(":")
      .includes("gnome") ??
      false);
  return isGnomeWayland
    ? "supported · missing · not-required · unavailable · not-applicable"
    : "unsupported · not-required · not-required · unavailable · not-applicable";
}

/**
 * Waits until the real Renderer has completed its bootstrap Contract call.
 *
 * @param page The Electron Host Renderer page.
 * @returns Nothing after the visible ready state is rendered.
 */
async function waitForHostReady(page: Page): Promise<void> {
  await expect(page.getByText("宿主已就绪")).toBeVisible();
  await expect(page.getByText(/Contract Gateway v1/)).toBeVisible();
}

test("loads the isolated Host UI and rotates its connection on reload", async () => {
  const isolatedUserData = await mkdtemp(
    resolve(tmpdir(), "ztools-electron-e2e-"),
  );
  const outputLines: string[] = [];
  let application: ElectronApplication | undefined;

  try {
    const platformArguments =
      process.platform === "linux" &&
      process.env["XDG_SESSION_TYPE"] === "wayland"
        ? ["--ozone-platform=wayland", "--disable-vulkan"]
        : [];
    application = await electron.launch({
      executablePath: electronExecutable,
      args: [...platformArguments, `--user-data-dir=${isolatedUserData}`, "."],
      cwd: desktopDirectory,
      env: {
        ...process.env,
        ZTOOLS_GATE1_E2E: "1",
      },
    });
    application.process().stdout?.on("data", (chunk: Buffer) => {
      outputLines.push(chunk.toString("utf8"));
    });

    const page = await application.firstWindow();
    await waitForHostReady(page);

    const evidence = await page.evaluate<HostPageEvidence>(() => ({
      bridgeKeys: Object.keys(window.ztoolsHost).sort(),
      processType: typeof Reflect.get(globalThis, "process"),
      requireType: typeof Reflect.get(globalThis, "require"),
    }));
    expect(evidence).toEqual({
      bridgeKeys: [
        "executeAction",
        "getBootstrap",
        "setWindowVisibility",
        "startSearch",
      ],
      processType: "undefined",
      requireType: "undefined",
    });

    const searchInput = page.getByLabel("搜索命令");
    await searchInput.fill("不存在的查询");
    await expect(page.locator(".empty")).toHaveText("没有匹配的宿主命令");
    await expect(page.locator("#search-feedback")).toHaveText(
      "没有匹配的宿主命令",
    );
    await expect(
      page.getByRole("listbox").getByText("没有匹配的宿主命令"),
    ).toHaveCount(0);
    await searchInput.fill("隐藏");
    await expect(
      page.getByRole("option", { name: /隐藏 ZTools/ }),
    ).toBeVisible();
    await expect(page.locator("#search-feedback")).toHaveText(
      "找到 1 个搜索结果",
    );
    await expect(page.getByRole("listbox")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.getByRole("listbox")).not.toHaveAttribute(
      "aria-live",
      /.+/u,
    );
    await searchInput.fill("状态");
    await expect(page.getByRole("option", { name: /隐藏 ZTools/ })).toHaveCount(
      0,
    );
    await searchInput.fill("隐藏");
    await expect(
      page.getByRole("option", { name: /隐藏 ZTools/ }),
    ).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(searchInput).toHaveValue("");
    await expect(
      page.getByRole("option", { name: /隐藏 ZTools/ }),
    ).toBeVisible();
    await expect(searchInput).toHaveAttribute("role", "combobox");
    await expect(searchInput).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("option", { name: /隐藏 ZTools/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(searchInput).toHaveAttribute(
      "aria-describedby",
      "search-instructions search-feedback",
    );

    await page.emulateMedia({ forcedColors: "active" });
    const forcedColorEvidence = await page.evaluate(() => {
      const selected = document.querySelector<HTMLElement>(".result.selected");
      const input = document.querySelector<HTMLElement>("#search-input");
      if (selected === null || input === null) {
        throw new Error("forced-color evidence elements are missing");
      }
      input.focus();
      const selectedStyle = getComputedStyle(selected);
      const inputStyle = getComputedStyle(input);
      return {
        active: matchMedia("(forced-colors: active)").matches,
        selectedAdjustment: selectedStyle.forcedColorAdjust,
        inputOutlineStyle: inputStyle.outlineStyle,
        inputOutlineWidth: Number.parseFloat(inputStyle.outlineWidth),
      };
    });
    expect(forcedColorEvidence).toMatchObject({
      active: true,
      selectedAdjustment: "none",
      inputOutlineStyle: "solid",
    });
    expect(forcedColorEvidence.inputOutlineWidth).toBeGreaterThanOrEqual(2);
    await page.emulateMedia({ forcedColors: "none" });

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
    });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          zoom: window.devicePixelRatio,
          horizontalOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        })),
      )
      .toMatchObject({ horizontalOverflow: 0 });
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
    });

    const baselineLifecycleEvents = parseLifecycleEvents(outputLines.join(""));
    const baselineEstablishedCount = baselineLifecycleEvents.filter(
      ({ event }) => event === "ztools.connection.established",
    ).length;
    const baselineRevokedCount = baselineLifecycleEvents.filter(
      ({ event }) => event === "ztools.connection.revoked",
    ).length;
    const reloadCycles = 24;
    for (let index = 0; index < reloadCycles; index += 1) {
      await page.reload();
      await waitForHostReady(page);
    }

    await expect
      .poll(
        () => {
          const lifecycleEvents = parseLifecycleEvents(outputLines.join(""));
          const establishedEpochs = lifecycleEvents
            .filter(({ event }) => event === "ztools.connection.established")
            .map(({ connectionEpoch }) => connectionEpoch);
          const revokedEpochs = lifecycleEvents
            .filter(({ event }) => event === "ztools.connection.revoked")
            .map(({ connectionEpoch }) => connectionEpoch);
          return {
            establishedCount: establishedEpochs.length,
            revokedCount: revokedEpochs.length,
            strictlyIncreasing: establishedEpochs.every(
              (epoch, index) =>
                index === 0 || epoch > (establishedEpochs[index - 1] ?? 0),
            ),
          };
        },
        { timeout: 5_000 },
      )
      .toEqual({
        establishedCount: baselineEstablishedCount + reloadCycles,
        revokedCount: baselineRevokedCount + reloadCycles,
        strictlyIncreasing: true,
      });

    await searchInput.fill("隐藏");
    await expect(
      page.getByRole("option", { name: /隐藏 ZTools/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        application?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isVisible(),
        ),
      )
      .toBe(false);
    await expect
      .poll(() =>
        parseSearchResourceEvents(outputLines.join(""))
          .filter(({ event }) => event === "ztools.search.hidden-cleanup")
          .at(-1),
      )
      .toMatchObject({
        event: "ztools.search.hidden-cleanup",
        reason: "window-hidden",
        activeSessionCount: 0,
        unackedBatchCount: 0,
        capacityWaiterCount: 0,
      });
    const secondInstance = spawn(
      electronExecutable,
      [
        ...platformArguments,
        ...getSpawnedElectronArguments(),
        `--user-data-dir=${isolatedUserData}`,
        ".",
      ],
      {
        cwd: desktopDirectory,
        env: { ...process.env, ZTOOLS_GATE1_E2E: "1" },
        stdio: "ignore",
      },
    );
    await waitForSecondInstanceExit(secondInstance);
    await expect
      .poll(() =>
        application?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isVisible(),
        ),
      )
      .toBe(true);
    await expect
      .poll(() => parseSecondInstanceEvents(outputLines.join("")).at(-1))
      .toEqual({
        event: "ztools.launcher.second-instance",
        effectOutcome: "committed",
        visibility: "visible",
        health: "ready",
      });
    expect(application.windows()).toHaveLength(1);
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();
    await searchInput.fill("");
    await page.keyboard.press("Escape");
    await expect
      .poll(() =>
        application?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isVisible(),
        ),
      )
      .toBe(false);
    await page.evaluate(() =>
      window.ztoolsHost.setWindowVisibility("show", "launcher-recall"),
    );
    await expect(page.getByText(/窗口显示：/)).toContainText(
      "supported · not-required · not-required · ready · not-applicable",
    );
    await expect(page.getByText(/焦点恢复：/)).toContainText(
      getExpectedFocusCapabilitySummary(),
    );

    const recallSamples = await page.evaluate(async () => {
      const samples: number[] = [];
      const search = document.querySelector<HTMLInputElement>("#search-input");
      if (search === null) {
        throw new Error("search input missing");
      }
      for (let index = 0; index < 30; index += 1) {
        await window.ztoolsHost.setWindowVisibility("hide", "user-action");
        const startedAt = performance.now();
        const response = await window.ztoolsHost.setWindowVisibility(
          "show",
          "launcher-recall",
        );
        await new Promise<void>((resolveFrame) => {
          requestAnimationFrame(() => {
            resolveFrame();
          });
        });
        if (!response.ok || response.value?.visibility !== "visible") {
          throw new Error("launcher recall was not committed");
        }
        search.focus();
        if (document.activeElement !== search) {
          throw new Error("search input was not interactive after recall");
        }
        samples.push(performance.now() - startedAt);
      }
      return samples;
    });
    recallSamples.sort((left, right) => left - right);
    const recallP95 = recallSamples[Math.ceil(recallSamples.length * 0.95) - 1];
    expect(recallP95).toBeLessThanOrEqual(300);

    const popupResult = await page.evaluate(
      () =>
        window.open("https://example.invalid/popup-must-fail", "_blank") ===
        null,
    );
    expect(popupResult).toBe(true);
    expect(application.windows()).toHaveLength(1);

    const originalUrl = page.url();
    await page.evaluate(() => {
      window.location.href = "https://example.invalid/navigation-must-fail";
    });
    await expect.poll(() => page.url()).toBe(originalUrl);
  } finally {
    await application?.close();
    await rm(isolatedUserData, { recursive: true, force: true });
  }
});

test("recovers the trusted Host UI within a bounded Renderer crash budget", async () => {
  const isolatedUserData = await mkdtemp(
    resolve(tmpdir(), "ztools-electron-crash-e2e-"),
  );
  const outputLines: string[] = [];
  let applicationProcess: ReturnType<typeof spawn> | undefined;
  let applicationExit:
    Promise<[number | null, NodeJS.Signals | null]> | undefined;

  try {
    const platformArguments =
      process.platform === "linux" &&
      process.env["XDG_SESSION_TYPE"] === "wayland"
        ? ["--ozone-platform=wayland", "--disable-vulkan"]
        : [];
    applicationProcess = spawn(
      electronExecutable,
      [
        ...platformArguments,
        ...getSpawnedElectronArguments(),
        `--user-data-dir=${isolatedUserData}`,
        ".",
      ],
      {
        cwd: desktopDirectory,
        env: {
          ...process.env,
          ZTOOLS_GATE1_E2E: "1",
          ZTOOLS_RENDERER_RECOVERY_E2E: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    applicationExit = once(applicationProcess, "exit") as Promise<
      [number | null, NodeJS.Signals | null]
    >;
    applicationProcess.stdout?.on("data", (chunk: Buffer) => {
      outputLines.push(chunk.toString("utf8"));
    });
    applicationProcess.stderr?.on("data", (chunk: Buffer) => {
      outputLines.push(chunk.toString("utf8"));
    });
    await expect
      .poll(() =>
        parseSearchResourceEvents(outputLines.join(""))
          .filter(({ event }) => event === "ztools.search.batch-pending")
          .at(-1),
      )
      .toMatchObject({
        event: "ztools.search.batch-pending",
        reason: "result-batch-emitted",
        activeSessionCount: 1,
        unackedBatchCount: 1,
      });
    const crashEpoch = parseSearchResourceEvents(outputLines.join(""))
      .filter(({ event }) => event === "ztools.search.batch-pending")
      .at(0)?.connectionEpoch;
    expect(crashEpoch).toBeDefined();
    await expect
      .poll(() =>
        parseSearchResourceEvents(outputLines.join(""))
          .filter(
            ({ event, connectionEpoch }) =>
              event === "ztools.search.connection-cleanup" &&
              connectionEpoch === crashEpoch,
          )
          .at(-1),
      )
      .toEqual({
        event: "ztools.search.connection-cleanup",
        reason: "render-process-gone",
        connectionEpoch: crashEpoch,
        activeSessionCount: 0,
        unackedBatchCount: 0,
        capacityWaiterCount: 0,
      });
    await expect
      .poll(() => parseRendererRecoveryEvidence(outputLines.join("")), {
        timeout: 5_000,
      })
      .toEqual([
        {
          event: "ztools.e2e.renderer-recovered",
          recovery: 1,
          ready: true,
          focused: true,
          bridgeAvailable: true,
        },
        {
          event: "ztools.e2e.renderer-recovered",
          recovery: 2,
          ready: true,
          focused: true,
          bridgeAvailable: true,
        },
      ]);
    const establishedEpochs = parseLifecycleEvents(outputLines.join(""))
      .filter(({ event }) => event === "ztools.connection.established")
      .map(({ connectionEpoch }) => connectionEpoch);
    expect(establishedEpochs.at(-2)).toBeGreaterThan(crashEpoch ?? 0);
    expect(establishedEpochs.at(-1)).toBeGreaterThan(
      establishedEpochs.at(-2) ?? 0,
    );
    const [exitCode, exitSignal] = await applicationExit;
    expect({ exitCode, exitSignal }).toEqual({ exitCode: 1, exitSignal: null });
    expect(outputLines.join("")).toContain(
      '"event":"ztools.renderer.recovery-exhausted"',
    );
  } finally {
    if (applicationProcess?.exitCode === null) applicationProcess.kill();
    await rm(isolatedUserData, { recursive: true, force: true });
  }
});
