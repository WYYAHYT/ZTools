import { build } from "esbuild";

const sharedOptions = {
  bundle: true,
  external: ["electron"],
  logLevel: "info",
  platform: "node",
  sourcemap: true,
  target: "node24",
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: ["src/main/main.ts"],
    format: "esm",
    outfile: "dist/main/main.js",
  }),
  build({
    ...sharedOptions,
    entryPoints: ["src/main/preload-bridge.ts"],
    format: "cjs",
    outfile: "dist/main/preload-bridge.cjs",
  }),
]);
