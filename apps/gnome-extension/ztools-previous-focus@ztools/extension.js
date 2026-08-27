/* global global */

import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { createDbusServer } from "./dbus-server.js";
import { createFocusStateMachine } from "./focus-state-machine.mjs";

const HOST_DESKTOP_ID = "com.ztools.ZTools";

export default class ZToolsPreviousFocusExtension extends Extension {
  enable() {
    const extensionEpoch = GLib.uuid_string_random().replaceAll("-", "_");
    const isHostWindow = (window) => {
      const gtkApplicationId = window?.get_gtk_application_id?.();
      const windowClass = window?.get_wm_class?.();
      return (
        gtkApplicationId === HOST_DESKTOP_ID || windowClass === HOST_DESKTOP_ID
      );
    };
    const isRestorableWindow = (window) => {
      if (window === null || window === undefined || isHostWindow(window)) {
        return false;
      }
      const minimized =
        typeof window.is_minimized === "function"
          ? window.is_minimized()
          : window.minimized === true;
      const skipTaskbar =
        typeof window.is_skip_taskbar === "function"
          ? window.is_skip_taskbar()
          : window.skip_taskbar === true;
      const windowType =
        typeof window.get_window_type === "function"
          ? window.get_window_type()
          : window.window_type;
      return (
        !minimized && !skipTaskbar && windowType === Meta.WindowType.NORMAL
      );
    };
    const machine = createFocusStateMachine({
      extensionEpoch,
      isHostWindow,
      isRestorableWindow,
      getFocusedWindow: () => global.display.focus_window,
      onCandidateChanged: (oldWindow, window) => {
        if (
          oldWindow !== this._unmanagingWindow &&
          this._candidateUnmanagedSignal !== undefined
        ) {
          oldWindow.disconnect(this._candidateUnmanagedSignal);
        }
        this._candidateWindow = undefined;
        this._candidateUnmanagedSignal = undefined;
        if (window === null) return;
        this._candidateWindow = window;
        this._candidateUnmanagedSignal = window.connect("unmanaged", () => {
          this._unmanagingWindow = window;
          try {
            machine.invalidateCandidate(window);
          } finally {
            this._unmanagingWindow = undefined;
          }
        });
      },
      activateWindow: (window) => {
        window.activate(global.get_current_time());
        return global.display.focus_window === window;
      },
    });
    this._focusSignal = global.display.connect("notify::focus-window", () => {
      machine.observeFocusWindow(global.display.focus_window);
    });
    this._workspaceSignal = global.workspace_manager.connect(
      "active-workspace-changed",
      () => {
        machine.invalidateFocusContext();
      },
    );
    machine.observeFocusWindow(global.display.focus_window);
    this._machine = machine;
    this._dbusServer = createDbusServer(machine);
    this._dbusServer.start();
  }

  disable() {
    if (this._focusSignal !== undefined) {
      global.display.disconnect(this._focusSignal);
      this._focusSignal = undefined;
    }
    if (this._workspaceSignal !== undefined) {
      global.workspace_manager.disconnect(this._workspaceSignal);
      this._workspaceSignal = undefined;
    }
    this._machine?.revoke();
    this._dbusServer?.stop();
    this._dbusServer = undefined;
    this._machine = undefined;
  }
}
