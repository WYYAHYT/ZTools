import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/host-gateway/test/gateway-pressure.test.ts",
      "packages/host-gateway/test/search-pressure.test.ts",
    ],
    exclude: ["**/node_modules/**"],
    environment: "node",
    passWithNoTests: false,
    restoreMocks: true,
  },
});
