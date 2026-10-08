import { defineConfig, devices } from "@playwright/test";

// Fixed ports shared with tests/harness/serve-stack.ts.
const APP_URL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "e2e",
  // The real-time flow takes about 65 s.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: APP_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && tsx tests/harness/serve-stack.ts",
    url: `${APP_URL}/config.json`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
