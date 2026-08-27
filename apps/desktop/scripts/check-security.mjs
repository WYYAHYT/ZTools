import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const desktopDirectory = resolve(import.meta.dirname, "..");

/**
 * Requires a source-level security invariant used by the Gate 1 CI check.
 *
 * @param condition The matched invariant or false when it is missing.
 * @param label The stable invariant label used in failure diagnostics.
 * @returns Nothing when the invariant is present.
 * @throws {Error} When the required security invariant is absent.
 */
function requireInvariant(condition, label) {
  if (!condition) {
    throw new Error(`security invariant failed: ${label}`);
  }
}

const [
  policy,
  networkPolicy,
  transportEnvelope,
  gnomeTransport,
  main,
  index,
  preload,
] = await Promise.all([
  readFile(resolve(desktopDirectory, "src/main/security-policy.ts"), "utf8"),
  readFile(resolve(desktopDirectory, "src/main/network-policy.ts"), "utf8"),
  readFile(resolve(desktopDirectory, "src/main/transport-envelope.ts"), "utf8"),
  readFile(
    resolve(desktopDirectory, "src/main/gnome-dbus-transport.ts"),
    "utf8",
  ),
  readFile(resolve(desktopDirectory, "src/main/main.ts"), "utf8"),
  readFile(resolve(desktopDirectory, "index.html"), "utf8"),
  readFile(resolve(desktopDirectory, "src/main/preload-bridge.ts"), "utf8"),
]);

requireInvariant(
  /contextIsolation:\s*true/u.test(policy),
  "contextIsolation=true",
);
requireInvariant(
  /nodeIntegration:\s*false/u.test(policy),
  "nodeIntegration=false",
);
requireInvariant(/sandbox:\s*true/u.test(policy), "sandbox=true");
requireInvariant(/webSecurity:\s*true/u.test(policy), "webSecurity=true");
requireInvariant(
  /disable-background-networking/u.test(networkPolicy),
  "Chromium background networking disabled",
);
requireInvariant(
  /host-resolver-rules/u.test(networkPolicy) &&
    /MAP \* ~NOTFOUND/u.test(networkPolicy),
  "Chromium host resolution denied",
);
requireInvariant(
  /https:\/\/\*\/\*/u.test(networkPolicy) &&
    /callback\(\{ cancel: true \}\)/u.test(networkPolicy),
  "remote requests denied",
);
requireInvariant(/Content-Security-Policy/u.test(index), "CSP declaration");
requireInvariant(/script-src 'self'/u.test(index), "CSP self script source");
requireInvariant(
  /connect-src 'none'/u.test(index),
  "CSP disabled network source",
);
requireInvariant(
  /const DANGEROUS_OBJECT_KEYS = new Set\(\[\s*"__proto__",\s*"constructor",\s*"prototype",/u.test(
    transportEnvelope,
  ),
  "prototype-sensitive transport keys denied",
);
requireInvariant(
  /Object\.create\(null\)/u.test(transportEnvelope),
  "transport objects rebuilt without prototypes",
);
requireInvariant(/event\.preventDefault\(\)/u.test(main), "navigation denial");
requireInvariant(
  /app\.setDesktopName\("com\.ztools\.ZTools"\)/u.test(main),
  "fixed Linux desktop identity",
);
requireInvariant(
  /app\.commandLine\.appendSwitch\("class", "com\.ztools\.ZTools"\)/u.test(
    main,
  ),
  "fixed Linux window class",
);
requireInvariant(
  /const GDBUS_EXECUTABLE = "\/usr\/bin\/gdbus"/u.test(gnomeTransport),
  "fixed GNOME D-Bus executable",
);
requireInvariant(/shell: false/u.test(gnomeTransport), "no shell execution");
requireInvariant(
  /const METHOD_NAME = `\$\{INTERFACE_NAME\}\.RestorePreviousFocus`/u.test(
    gnomeTransport,
  ),
  "fixed GNOME D-Bus method",
);
requireInvariant(
  !/child_process/u.test(preload),
  "no platform process access in preload",
);
requireInvariant(
  /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/u.test(main),
  "window-open denial",
);
requireInvariant(
  /contextBridge\.exposeInMainWorld\("ztoolsHost"/u.test(preload),
  "named bridge",
);
requireInvariant(/getBootstrap\(\)/u.test(preload), "bootstrap bridge method");
requireInvariant(
  !/invoke\(.*method/u.test(preload),
  "no generic bridge invoke",
);

console.log("Electron security invariants passed");
