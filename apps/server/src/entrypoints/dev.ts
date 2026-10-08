import { startDevServer } from "./dev-server.ts";

// Local development: API + settler loop + config.json. The web app's Vite dev server proxies to it.
const DEV_API_PORT = 8787;

// Local defaults: DynamoDB Local from docker compose. Everything is overridable by environment.
const env = { DYNAMODB_ENDPOINT: "http://127.0.0.1:8100", ...process.env };

await startDevServer({ port: DEV_API_PORT, env, runSettler: true });
console.log(`API on http://127.0.0.1:${DEV_API_PORT}`);
