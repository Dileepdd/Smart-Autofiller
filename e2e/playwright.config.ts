import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "specs",
  outputDir: "test-results",
  globalSetup: "./support/global-setup.ts",
  // One real browser window, because a popup closes as soon as another window takes focus.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]]
});
