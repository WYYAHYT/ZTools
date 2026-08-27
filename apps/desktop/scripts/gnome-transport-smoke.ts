import { createGnomeDbusTransport } from "../src/main/gnome-dbus-transport.js";
import { createGnomePreviousFocusClient } from "../src/main/gnome-previous-focus-protocol.js";

const transport = createGnomeDbusTransport();
if (!(await transport.probe())) {
  throw new Error("GNOME extension transport probe failed");
}

const client = createGnomePreviousFocusClient(
  "headless_transport_nonce_1234567890",
  transport,
);
const result = await client.restore(Date.now() + 5_000);
if (
  !result.ok ||
  result.focusResult !== "restricted" ||
  result.reasonCode !== "focus.hostNotForeground"
) {
  throw new Error("GNOME extension transport result mismatch");
}

console.log("main-transport=host-not-foreground");
