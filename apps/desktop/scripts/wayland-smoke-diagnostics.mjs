const knownVulkanWarning =
  /^\[\d+:\d+\/\d+\.\d+:ERROR:ui\/ozone\/platform\/wayland\/gpu\/wayland_surface_factory\.cc:249\] '--ozone-platform=wayland' is not compatible with Vulkan\. Consider switching to '--ozone-platform=x11' or disabling Vulkan$/;
const knownHeadlessDbusError =
  /^\[\d+:\d+\/\d+\.\d+:ERROR:dbus\/(?:bus|object_proxy)\.cc:\d+\] (?:Failed to connect to the bus:|Failed to call method: org\.freedesktop\.DBus\.)/;

/**
 * Classifies Electron stderr emitted by the native Wayland smoke process.
 *
 * @param {string} stderr The complete bounded stderr captured from Electron.
 * @returns {{knownVulkanWarnings: number, knownHeadlessDbusErrors: number, unexpectedErrors: readonly string[]}}
 */
export function classifyWaylandSmokeDiagnostics(stderr) {
  let knownVulkanWarnings = 0;
  let knownHeadlessDbusErrors = 0;
  const unexpectedErrors = [];
  for (const line of stderr.split(/\r?\n/)) {
    if (line.length === 0) continue;
    if (knownVulkanWarning.test(line)) {
      knownVulkanWarnings += 1;
    } else if (knownHeadlessDbusError.test(line)) {
      knownHeadlessDbusErrors += 1;
    } else if (line.includes("ERROR:")) {
      unexpectedErrors.push(line);
    }
  }
  return Object.freeze({
    knownVulkanWarnings,
    knownHeadlessDbusErrors,
    unexpectedErrors: Object.freeze(unexpectedErrors),
  });
}
