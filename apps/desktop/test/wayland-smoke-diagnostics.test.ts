import { describe, expect, it } from "vitest";

import { classifyWaylandSmokeDiagnostics } from "../scripts/wayland-smoke-diagnostics.mjs";

const knownWarning =
  "[123:0826/174838.106442:ERROR:ui/ozone/platform/wayland/gpu/wayland_surface_factory.cc:249] '--ozone-platform=wayland' is not compatible with Vulkan. Consider switching to '--ozone-platform=x11' or disabling Vulkan";

describe("Wayland smoke diagnostics", () => {
  it("classifies only the exact Electron 44 Wayland Vulkan warning", () => {
    expect(classifyWaylandSmokeDiagnostics(`${knownWarning}\n`)).toEqual({
      knownVulkanWarnings: 1,
      unexpectedErrors: [],
    });
  });

  it("reports unrelated Electron errors without hiding normal diagnostics", () => {
    expect(
      classifyWaylandSmokeDiagnostics(
        `normal diagnostic\n[123:ERROR:gpu/process.cc:1] GPU crashed\n`,
      ),
    ).toEqual({
      knownVulkanWarnings: 0,
      unexpectedErrors: ["[123:ERROR:gpu/process.cc:1] GPU crashed"],
    });
  });

  it("does not accept a warning line with appended content", () => {
    expect(
      classifyWaylandSmokeDiagnostics(`${knownWarning} injected\n`),
    ).toEqual({
      knownVulkanWarnings: 0,
      unexpectedErrors: [`${knownWarning} injected`],
    });
  });
});
