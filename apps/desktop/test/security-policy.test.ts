import { describe, expect, it } from "vitest";

import { createHostWebPreferences } from "../src/main/security-policy.js";

describe("Host Renderer security policy", () => {
  it("keeps every required Electron boundary enabled", () => {
    expect(createHostWebPreferences("/isolated/preload.cjs")).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: "/isolated/preload.cjs",
    });
  });

  it("does not expose an opt-out switch for security settings", () => {
    const policy = createHostWebPreferences("/isolated/preload.cjs");
    expect(policy).not.toHaveProperty("enableRemoteModule");
    expect(policy).not.toHaveProperty("webviewTag");
  });
});
