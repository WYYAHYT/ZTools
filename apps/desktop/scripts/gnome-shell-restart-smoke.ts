import { access, writeFile } from "node:fs/promises";

import { createGnomeDbusTransport } from "../src/main/gnome-dbus-transport.js";
import { createGnomePreviousFocusClient } from "../src/main/gnome-previous-focus-protocol.js";

const readyPath = process.env["ZTOOLS_SHELL_RESTART_READY"];
const continuePath = process.env["ZTOOLS_SHELL_RESTART_CONTINUE"];
if (readyPath === undefined || continuePath === undefined) {
  throw new Error("GNOME Shell restart synchronization paths are required");
}

/**
 * Waits for the isolated Shell controller to create one synchronization file.
 *
 * @param path The fixed temporary marker path inside the isolated test root.
 * @param timeoutMs The maximum time allowed for the Shell restart stage.
 * @returns Nothing after the marker becomes readable.
 * @throws {Error} When the marker is not created before the deadline.
 */
async function waitForMarker(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise<void>((resolveDelay) => {
        setTimeout(resolveDelay, 50);
      });
    }
  }
  throw new Error(`GNOME Shell restart marker timed out: ${path}`);
}

const client = createGnomePreviousFocusClient(
  "headless_shell_restart_client_nonce_1234567890",
  createGnomeDbusTransport(),
);
const beforeRestart = await client.restore(Date.now() + 5_000);
if (
  !beforeRestart.ok ||
  beforeRestart.focusResult !== "restricted" ||
  beforeRestart.reasonCode !== "focus.hostNotForeground"
) {
  throw new Error("initial GNOME Shell client call did not establish an epoch");
}

await writeFile(readyPath, "ready\n", { flag: "wx" });
await waitForMarker(continuePath, 10_000);

const afterRestart = await client.restore(Date.now() + 5_000);
if (
  afterRestart.ok ||
  afterRestart.reasonCode !== "focus.extensionEpochChanged"
) {
  throw new Error("old GNOME Host client accepted a restarted Shell epoch");
}
const afterRevocation = await client.restore(Date.now() + 5_000);
if (
  afterRevocation.ok ||
  afterRevocation.reasonCode !== "focus.sessionRevoked"
) {
  throw new Error("old GNOME Host client was not revoked after epoch rotation");
}

console.log("shell-restart=epoch-changed-session-revoked");
