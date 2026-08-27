const knownVulkanWarning =
  /^\[\d+:\d+\/\d+\.\d+:ERROR:ui\/ozone\/platform\/wayland\/gpu\/wayland_surface_factory\.cc:249\] '--ozone-platform=wayland' is not compatible with Vulkan\. Consider switching to '--ozone-platform=x11' or disabling Vulkan$/;

/**
 * Classifies Electron stderr emitted by the native Wayland smoke process.
 *
 * @param {string} stderr The complete bounded stderr captured from Electron.
 * @returns {{knownVulkanWarnings: number, unexpectedErrors: readonly string[]}}
 */
export function classifyWaylandSmokeDiagnostics(stderr) {
  let knownVulkanWarnings = 0;
  const unexpectedErrors = [];
  for (const line of stderr.split(/\r?\n/)) {
    if (line.length === 0) continue;
    if (knownVulkanWarning.test(line)) {
      knownVulkanWarnings += 1;
    } else if (line.includes("ERROR:")) {
      unexpectedErrors.push(line);
    }
  }
  return Object.freeze({
    knownVulkanWarnings,
    unexpectedErrors: Object.freeze(unexpectedErrors),
  });
}
