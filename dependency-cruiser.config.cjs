module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "application-does-not-depend-on-delivery-or-adapters",
      severity: "error",
      from: { path: "^packages/(bootstrap-application|search-application)/" },
      to: { path: "^(apps/|packages/host-gateway/)" },
    },
    {
      name: "search-domain-is-technology-independent",
      severity: "error",
      from: { path: "^packages/search-domain/" },
      to: { path: "^(apps/|packages/(?!search-domain/)|node_modules/)" },
    },
    {
      name: "contracts-do-not-depend-on-application-or-delivery",
      severity: "error",
      from: { path: "^packages/(contract-kernel|host-contracts)/" },
      to: { path: "^(apps/|packages/(bootstrap-application|host-gateway)/)" },
    },
    {
      name: "only-desktop-delivery-may-import-electron",
      severity: "error",
      from: { pathNot: "^apps/desktop/" },
      to: { dependencyTypes: ["npm"], path: "^electron$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^(apps|packages)/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/[^/]+" },
    },
  },
};
