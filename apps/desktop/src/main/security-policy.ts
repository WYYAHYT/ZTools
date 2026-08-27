import type { WebPreferences } from "electron";

/**
 * Builds the security boundary for the trusted Host Renderer.
 *
 * @param preloadPath The absolute path to the narrow preload bridge.
 * @returns Web preferences that preserve Electron isolation and disable Node.js access.
 */
export function createHostWebPreferences(preloadPath: string): WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    preload: preloadPath,
  };
}
