import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    label: "integration",
    files: "client/out/test/**/*.test.js",
    extensionDevelopmentPath: ".",
    launchArgs: ["--disable-extensions", "--locale", "en-US"],
    mocha: {
      timeout: 100000,
      ui: "bdd",
    },
  },
]);
