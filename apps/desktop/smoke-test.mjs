import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { classifyWaylandSmokeDiagnostics } from "./scripts/wayland-smoke-diagnostics.mjs";

const desktopDirectory = fileURLToPath(new URL(".", import.meta.url));
const electron = resolve(
  desktopDirectory,
  "node_modules/electron/dist/electron",
);
const MAX_STDERR_BYTES = 64 * 1024;
const isolatedUserData = await mkdtemp(
  resolve(tmpdir(), "ztools-wayland-smoke-"),
);
const child = spawn(
  electron,
  [
    "--ozone-platform=wayland",
    "--disable-vulkan",
    `--user-data-dir=${isolatedUserData}`,
    ".",
  ],
  {
    cwd: desktopDirectory,
    env: { ...process.env, ZTOOLS_GATE1_SMOKE: "1" },
    stdio: ["ignore", "inherit", "pipe"],
  },
);
let stderr = "";
let stderrExceeded = false;

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  if (stderrExceeded) return;
  stderr += chunk;
  if (Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) {
    stderrExceeded = true;
    child.kill("SIGKILL");
  }
});

child.on("error", (error) => {
  console.error(error);
  void rm(isolatedUserData, { recursive: true, force: true }).finally(() => {
    process.exit(1);
  });
});

child.on("exit", async (code, signal) => {
  await rm(isolatedUserData, { recursive: true, force: true });
  if (stderr.length > 0) process.stderr.write(stderr);
  if (stderrExceeded) {
    console.error("Wayland smoke stderr exceeded 64 KiB");
    process.exit(1);
  }
  if (signal !== null) {
    process.kill(process.pid, signal);
  }
  if (code !== 0) {
    process.exit(code ?? 1);
  }
  const diagnostics = classifyWaylandSmokeDiagnostics(stderr);
  if (diagnostics.unexpectedErrors.length > 0) {
    console.error(
      `Unexpected Electron ERROR diagnostics: ${diagnostics.unexpectedErrors.length}`,
    );
    process.exit(1);
  }
  if (diagnostics.knownVulkanWarnings > 1) {
    console.error(
      `Repeated known Wayland Vulkan warnings: ${diagnostics.knownVulkanWarnings}`,
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      event: "ztools-wayland-smoke-diagnostics",
      vulkanCompatibility:
        diagnostics.knownVulkanWarnings === 1
          ? "expected-warning"
          : "not-observed",
      unexpectedErrors: 0,
    }),
  );
  process.exit(0);
});
