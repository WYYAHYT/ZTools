import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { waitForChildExit } from "./child-process-exit.mjs";
import {
  resolveDirectoryTarget,
  resolvePackagedExecutable,
} from "./directory-platform-matrix.mjs";
import { classifyWaylandSmokeDiagnostics } from "./wayland-smoke-diagnostics.mjs";

const desktopDirectory = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(desktopDirectory, "../..");
const artifactRoot = resolve(repositoryRoot, "artifacts/desktop-directory");
const diagnosticDirectory = resolve(
  repositoryRoot,
  "artifacts/desktop-directory-smoke",
);
const diagnosticPath = join(diagnosticDirectory, "diagnostics.json");
const maximumOutputBytes = 64 * 1024;
const target = resolveDirectoryTarget(process.platform, process.arch);
const isolatedUserData = await mkdtemp(
  join(tmpdir(), "ztools-directory-smoke-"),
);

/**
 * Appends output while enforcing the bounded diagnostic budget.
 *
 * @param current The output collected before this chunk.
 * @param chunk The new process output bytes.
 * @returns The combined UTF-8 output.
 * @throws {Error} When output exceeds the fixed 64 KiB budget.
 */
function appendBoundedOutput(current, chunk) {
  const combined = current + chunk.toString("utf8");
  if (Buffer.byteLength(combined, "utf8") > maximumOutputBytes) {
    throw new Error("Directory artifact smoke output exceeded 64 KiB");
  }
  return combined;
}

/**
 * Extracts the trusted Host readiness event from bounded process output.
 *
 * @param output The complete stdout emitted by the packaged application.
 * @returns The parsed readiness evidence, or undefined when absent.
 */
function parseReadyEvidence(output) {
  for (const line of output.split(/\r?\n/u)) {
    try {
      const value = JSON.parse(line);
      if (value?.event === "ztools-gate1-smoke-ready") return value;
    } catch {
      // Non-JSON Electron output is checked separately as bounded diagnostics.
    }
  }
  return undefined;
}

/**
 * Writes a payload-free smoke summary suitable for short-lived CI failure evidence.
 *
 * @param diagnostics The bounded stage, process and isolation observations.
 * @returns Nothing after replacing the single structured diagnostic file.
 */
async function writeDiagnostics(diagnostics) {
  await mkdir(diagnosticDirectory, { recursive: true });
  await writeFile(
    diagnosticPath,
    `${JSON.stringify(diagnostics, null, 2)}\n`,
    "utf8",
  );
}

const packageDirectory = join(artifactRoot, target.artifactName);
const executable = join(packageDirectory, resolvePackagedExecutable(target));
const platformArguments =
  process.platform === "linux" && process.env["XDG_SESSION_TYPE"] === "wayland"
    ? ["--ozone-platform=wayland", "--disable-vulkan", "--no-sandbox"]
    : process.platform === "linux"
      ? ["--no-sandbox"]
      : [];
let stdout = "";
let stderr = "";
let outputFailure;
let stage = "locate-artifact";
const diagnostics = {
  event: "ztools-directory-package-smoke-diagnostics",
  status: "failed",
  platform: process.platform,
  architecture: process.arch,
  stage,
  exitCode: null,
  exitSignal: null,
  stdoutBytes: 0,
  stderrBytes: 0,
  readyEventPresent: false,
  ready: false,
  rendererProcessIsolated: false,
  rendererRequireIsolated: false,
  knownVulkanWarningCount: 0,
  unexpectedErrorCount: 0,
};

try {
  const artifactEntries = await readdir(packageDirectory);
  if (artifactEntries.length === 0) {
    throw new Error("Directory artifact is empty");
  }
  stage = "launch-artifact";
  const child = spawn(
    executable,
    [...platformArguments, `--user-data-dir=${isolatedUserData}`],
    {
      env: { ...process.env, ZTOOLS_GATE1_SMOKE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  stage = "collect-output";
  child.stdout.on("data", (chunk) => {
    try {
      stdout = appendBoundedOutput(stdout, chunk);
    } catch (error) {
      outputFailure = error;
      child.kill("SIGKILL");
    }
  });
  child.stderr.on("data", (chunk) => {
    try {
      stderr = appendBoundedOutput(stderr, chunk);
    } catch (error) {
      outputFailure = error;
      child.kill("SIGKILL");
    }
  });
  const { code, signal, timedOut } = await waitForChildExit(child, 15_000);
  diagnostics.exitCode = code;
  diagnostics.exitSignal = signal;
  diagnostics.stdoutBytes = Buffer.byteLength(stdout, "utf8");
  diagnostics.stderrBytes = Buffer.byteLength(stderr, "utf8");
  stage = "validate-exit";
  if (outputFailure !== undefined) throw outputFailure;
  if (timedOut) throw new Error("Directory artifact smoke timed out");
  if (code !== 0 || signal !== null) {
    throw new Error(
      `Directory artifact exited abnormally: code=${String(code)} signal=${String(signal)}`,
    );
  }
  stage = "validate-readiness";
  const evidence = parseReadyEvidence(stdout);
  diagnostics.readyEventPresent = evidence !== undefined;
  diagnostics.ready = evidence?.ready === true;
  diagnostics.rendererProcessIsolated = evidence?.processType === "undefined";
  diagnostics.rendererRequireIsolated = evidence?.requireType === "undefined";
  if (
    evidence?.ready !== true ||
    evidence.processType !== "undefined" ||
    evidence.requireType !== "undefined"
  ) {
    throw new Error("Directory artifact readiness evidence is invalid");
  }
  stage = "validate-diagnostics";
  const classifiedOutput = classifyWaylandSmokeDiagnostics(stderr);
  diagnostics.knownVulkanWarningCount = classifiedOutput.knownVulkanWarnings;
  diagnostics.unexpectedErrorCount = classifiedOutput.unexpectedErrors.length;
  if (
    classifiedOutput.unexpectedErrors.length > 0 ||
    classifiedOutput.knownVulkanWarnings > 1
  ) {
    throw new Error("Directory artifact emitted unsafe diagnostics");
  }
  stage = "completed";
  diagnostics.status = "passed";
  console.log(
    JSON.stringify({
      event: "ztools-directory-package-smoke-ready",
      platform: process.platform,
      architecture: process.arch,
      rendererProcess: evidence.processType,
      rendererRequire: evidence.requireType,
    }),
  );
} catch (error) {
  void error;
  diagnostics.stage = stage;
  console.error(
    JSON.stringify({
      event: "ztools-directory-package-smoke-failed",
      platform: process.platform,
      architecture: process.arch,
      stage,
    }),
  );
  process.exitCode = 1;
} finally {
  diagnostics.stage = stage;
  diagnostics.stdoutBytes = Buffer.byteLength(stdout, "utf8");
  diagnostics.stderrBytes = Buffer.byteLength(stderr, "utf8");
  try {
    await writeDiagnostics(diagnostics);
  } finally {
    // Profile cleanup must not depend on CI diagnostic storage remaining writable.
    await rm(isolatedUserData, { recursive: true, force: true });
  }
}
