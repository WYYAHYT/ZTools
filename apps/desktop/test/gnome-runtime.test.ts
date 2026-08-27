import { describe, expect, it } from "vitest";

import { isGnomeWaylandRuntime } from "../src/main/gnome-runtime.js";

describe("GNOME runtime selection", () => {
  it("accepts Ubuntu GNOME on native Wayland", () => {
    expect(
      isGnomeWaylandRuntime({
        platform: "linux",
        sessionType: "wayland",
        currentDesktop: "ubuntu:GNOME",
      }),
    ).toBe(true);
  });

  it.each([
    ["win32", "wayland", "GNOME"],
    ["darwin", "wayland", "GNOME"],
    ["linux", "x11", "GNOME"],
    ["linux", "wayland", "KDE"],
    ["linux", undefined, "GNOME"],
  ] as const)(
    "rejects platform=%s session=%s desktop=%s",
    (platform, sessionType, currentDesktop) => {
      expect(
        isGnomeWaylandRuntime({ platform, sessionType, currentDesktop }),
      ).toBe(false);
    },
  );
});
