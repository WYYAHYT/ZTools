import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("GNOME headless Shell smoke policy", () => {
  it("restarts the isolated Shell and verifies old Host client revocation", async () => {
    const source = await readFile(
      new URL(
        "../../gnome-extension/scripts/headless-smoke.sh",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain('readonly first_shell_pid="$shell_pid"');
    expect(source).toContain("stop_shell");
    expect(source).toContain('if [[ "$shell_pid" == "$first_shell_pid" ]]');
    expect(source).toContain("restart_enable_response");
    expect(source).toContain("org.gnome.Shell.Extensions.GetExtensionErrors");
    expect(source).toContain("gnome-shell-restart-smoke.mjs");
    expect(source).not.toContain("gnome-window-lifecycle-smoke.mjs");
    expect(source).not.toContain("gnome-focus-smoke.mjs");
    expect(source).toContain(
      "shell-restart=service-restored-old-client-revoked",
    );
  });

  it("keeps candidate lifecycle cleanup inside the minimal extension", async () => {
    const source = await readFile(
      new URL(
        "../../gnome-extension/ztools-previous-focus@ztools/extension.js",
        import.meta.url,
      ),
      "utf8",
    );
    const smoke = await readFile(
      new URL(
        "../../gnome-extension/scripts/headless-smoke.sh",
        import.meta.url,
      ),
      "utf8",
    );
    const focusSmoke = await readFile(
      new URL("../scripts/gnome-focus-smoke.ts", import.meta.url),
      "utf8",
    );
    const lifecycleSmoke = await readFile(
      new URL("../scripts/gnome-window-lifecycle-smoke.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('window.connect("unmanaged"');
    expect(source).toContain('"active-workspace-changed"');
    expect(source).toContain("machine.invalidateCandidate(window)");
    expect(source).toContain("machine.invalidateFocusContext()");
    expect(source).toContain("this._machine?.revoke()");
    expect(smoke).not.toContain("org.gnome.Shell.Eval");
    expect(smoke).not.toContain("org.gnome.Shell.FocusApp");
    expect(focusSmoke).not.toContain("org.gnome.Shell.FocusApp");
    expect(lifecycleSmoke).not.toContain("org.gnome.Shell.FocusApp");
  });
});
