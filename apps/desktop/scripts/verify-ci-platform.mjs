import { resolveDirectoryTarget } from "./directory-platform-matrix.mjs";

const target = resolveDirectoryTarget(process.platform, process.arch);

console.log(
  JSON.stringify({
    event: "ztools-ci-platform-verified",
    platform: target.platform,
    architecture: target.architecture,
    artifact: target.artifactName,
  }),
);
