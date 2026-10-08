// Runs the full local stack for Playwright (see playwright.config.ts): stub market,
// fresh DynamoDB Local table, API, settler loop and the built SPA on fixed ports.
// Any D10 variable in the environment (e.g. STALE_THRESHOLD_MS) is passed through.
import { resolve } from "node:path";
import { startStack } from "./stack.ts";

export const E2E_PORT = 4173;
export const E2E_MARKET_PORT = 4174;

const passthrough = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) => value !== undefined && /^[A-Z_]+$/.test(key) && key.endsWith("_MS"),
  ),
) as Record<string, string>;

const stack = await startStack({
  port: E2E_PORT,
  marketPort: E2E_MARKET_PORT,
  staticDir: resolve("apps/web/dist"),
  runSettler: true,
  env: passthrough,
});
console.log(`stack ready: app ${stack.baseUrl}, market ${stack.market.controlUrl}`);

const stop = async () => {
  await stack.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
