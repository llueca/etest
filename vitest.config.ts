import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/*/src/**/*.test.ts",
            "apps/server/src/**/*.test.ts",
            "tests/harness/**/*.test.ts",
            "tests/integration/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        test: {
          name: "web",
          include: ["apps/web/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./apps/web/src/test/setup.ts"],
        },
      },
      {
        test: {
          name: "acceptance",
          include: ["tests/acceptance/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "contract",
          include: ["tests/contract/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
