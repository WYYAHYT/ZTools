export interface GnomeRuntimeEnvironment {
  readonly platform: NodeJS.Platform;
  readonly sessionType: string | undefined;
  readonly currentDesktop: string | undefined;
}

/**
 * Determines whether the current process is in the supported GNOME Wayland runtime.
 *
 * @param environment The trusted process platform and desktop session values.
 * @returns True only for Linux, Wayland and a GNOME desktop token.
 */
export function isGnomeWaylandRuntime(
  environment: GnomeRuntimeEnvironment,
): boolean {
  return (
    environment.platform === "linux" &&
    environment.sessionType?.toLowerCase() === "wayland" &&
    (environment.currentDesktop?.toLowerCase().split(":").includes("gnome") ??
      false)
  );
}
