import type { CommandLine, Session } from "electron";

const disabledChromiumNetworkFeatures = [
  "disable-background-networking",
  "disable-component-update",
  "disable-domain-reliability",
] as const;
const deniedHostResolutionRule = "MAP * ~NOTFOUND";

const deniedRemoteSchemes = [
  "http://*/*",
  "https://*/*",
  "ws://*/*",
  "wss://*/*",
] as const;

/**
 * Disables Chromium services that may initiate background network traffic.
 *
 * @param commandLine Electron's Chromium command-line controller before app readiness.
 * @returns Nothing after all fixed network switches have been appended.
 */
export function disableChromiumBackgroundNetworking(
  commandLine: Pick<CommandLine, "appendSwitch">,
): void {
  for (const feature of disabledChromiumNetworkFeatures) {
    commandLine.appendSwitch(feature);
  }
  // Prevent Chromium startup services from resolving remote hosts before Session policy exists.
  commandLine.appendSwitch("host-resolver-rules", deniedHostResolutionRule);
}

/**
 * Denies every remote request in the current Host-only product slice.
 *
 * @param hostSession The isolated Electron session owned by the trusted Host window.
 * @returns Nothing after the request and permission policies have been installed.
 */
export function installHostNetworkPolicy(
  hostSession: Pick<Session, "webRequest" | "setPermissionRequestHandler">,
): void {
  hostSession.webRequest.onBeforeRequest(
    { urls: [...deniedRemoteSchemes] },
    (_details, callback): void => {
      callback({ cancel: true });
    },
  );
  hostSession.setPermissionRequestHandler(
    (_webContents, _permission, callback): void => {
      callback(false);
    },
  );
}
