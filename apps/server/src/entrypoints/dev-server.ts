import { readFile } from "node:fs/promises";
import { toWebConfig } from "@btc/shared/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "../app.ts";
import { createContext } from "../context.ts";
import { runSettlementPass } from "../features/settlement/settlement.ts";

export interface DevServerOptions {
  port: number;
  env?: Record<string, string | undefined>;
  /** Directory with the built SPA to serve, if any. */
  staticDir?: string;
  /** Run the settlement pass on an interval, like the settler Lambda does in AWS. */
  runSettler?: boolean;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/** Serves the API, config.json (from the same environment variables Terraform feeds the Lambdas) and the built SPA. */
export function startDevServer(options: DevServerOptions): Promise<RunningServer> {
  const ctx = createContext(options.env ?? process.env);
  const app = createApp(ctx);
  app.get("/config.json", (c) => c.json(toWebConfig(ctx.config)));
  if (options.staticDir) {
    const root = options.staticDir;
    app.use("/*", serveStatic({ root }));
    app.get("*", async (c) => c.html(await readFile(`${root}/index.html`, "utf8")));
  }

  let settling = false;
  const settler = options.runSettler
    ? setInterval(async () => {
        if (settling) return;
        settling = true;
        try {
          await runSettlementPass(new Date(), ctx);
        } catch (error) {
          console.error("settlement pass failed", error);
        } finally {
          settling = false;
        }
      }, ctx.config.settlementPollIntervalMs)
    : undefined;

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: options.port, hostname: "127.0.0.1" }, (info) =>
      resolve({
        port: info.port,
        close: () => {
          clearInterval(settler);
          return new Promise((done) => server.close(() => done()));
        },
      }),
    );
  });
}
