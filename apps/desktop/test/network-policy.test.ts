import { describe, expect, it, vi } from "vitest";

import {
  disableChromiumBackgroundNetworking,
  installHostNetworkPolicy,
} from "../src/main/network-policy.js";

describe("Host network policy", () => {
  it("disables Chromium background network services before startup", () => {
    const appendSwitch = vi.fn();

    disableChromiumBackgroundNetworking({ appendSwitch });

    expect(appendSwitch.mock.calls).toEqual([
      ["disable-background-networking"],
      ["disable-component-update"],
      ["disable-domain-reliability"],
      ["host-resolver-rules", "MAP * ~NOTFOUND"],
    ]);
  });

  it("denies remote requests and runtime permission prompts", () => {
    let requestListener:
      | ((
          details: object,
          callback: (response: { cancel: boolean }) => void,
        ) => void)
      | undefined;
    let permissionListener:
      | ((
          webContents: object,
          permission: string,
          callback: (allowed: boolean) => void,
        ) => void)
      | undefined;
    const onBeforeRequest = vi.fn(
      (
        filter: { readonly urls: readonly string[] },
        listener: NonNullable<typeof requestListener>,
      ): void => {
        expect(filter).toEqual({
          urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"],
        });
        requestListener = listener;
      },
    );
    const setPermissionRequestHandler = vi.fn(
      (listener: NonNullable<typeof permissionListener>): void => {
        permissionListener = listener;
      },
    );

    installHostNetworkPolicy({
      webRequest: { onBeforeRequest } as never,
      setPermissionRequestHandler,
    });

    const requestCallback = vi.fn();
    requestListener?.({}, requestCallback);
    expect(requestCallback).toHaveBeenCalledWith({ cancel: true });
    const permissionCallback = vi.fn();
    permissionListener?.({}, "notifications", permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);
  });
});
