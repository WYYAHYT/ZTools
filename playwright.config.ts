import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/desktop/e2e",
  outputDir: "./test-results/electron",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
});
