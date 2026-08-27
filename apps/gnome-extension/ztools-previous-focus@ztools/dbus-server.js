import Gio from "gi://Gio";
import GLib from "gi://GLib";

import {
  BUS_NAME,
  INTERFACE_NAME,
  OBJECT_PATH,
} from "./focus-state-machine.mjs";

export const DBUS_INTERFACE_XML = `<node>
  <interface name="${INTERFACE_NAME}">
    <method name="RestorePreviousFocus">
      <arg name="request" direction="in" type="s"/>
      <arg name="response" direction="out" type="s"/>
    </method>
  </interface>
</node>`;

/**
 * Verifies that a D-Bus caller belongs to the current Unix user.
 *
 * @param {object} invocation The GJS D-Bus method invocation.
 * @returns {boolean} True only when the peer UID matches the extension user.
 */
function isCurrentUserPeer(invocation) {
  try {
    const connection = invocation.get_connection();
    const sender = invocation.get_sender();
    const result = connection.call_sync(
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "GetConnectionUnixUser",
      new GLib.Variant("(s)", [sender]),
      new GLib.VariantType("(u)"),
      Gio.DBusCallFlags.NONE,
      100,
      null,
    );
    const [peerUid] = result.deep_unpack();
    const localUid = new Gio.Credentials().get_unix_user();
    return peerUid === localUid;
  } catch {
    return false;
  }
}

/**
 * Owns the fixed Session Bus name and exposes the single extension protocol method.
 *
 * @param {object} machine The protocol state machine.
 * @returns {{start: function(): void, stop: function(): void}}
 */
export function createDbusServer(machine) {
  let ownerId = 0;
  let exportedObject = null;

  return {
    start() {
      ownerId = Gio.bus_own_name(
        Gio.BusType.SESSION,
        BUS_NAME,
        Gio.BusNameOwnerFlags.NONE,
        (connection) => {
          exportedObject = Gio.DBusExportedObject.wrapJSObject(
            DBUS_INTERFACE_XML,
            {
              RestorePreviousFocusAsync([request], invocation) {
                if (typeof invocation?.return_value !== "function") return;
                if (
                  typeof invocation.get_sender !== "function" ||
                  typeof invocation.get_sender() !== "string" ||
                  !isCurrentUserPeer(invocation)
                ) {
                  invocation.return_value(
                    new GLib.Variant("(s)", [machine.restore(null)]),
                  );
                  return;
                }
                invocation.return_value(
                  new GLib.Variant("(s)", [machine.restore(request)]),
                );
              },
            },
          );
          exportedObject.export(connection, OBJECT_PATH);
        },
        () => {},
        () => {
          machine.revoke();
          if (exportedObject !== null) exportedObject.unexport();
          exportedObject = null;
        },
      );
    },
    stop() {
      machine.revoke();
      if (exportedObject !== null) exportedObject.unexport();
      exportedObject = null;
      if (ownerId !== 0) Gio.bus_unown_name(ownerId);
      ownerId = 0;
    },
  };
}
