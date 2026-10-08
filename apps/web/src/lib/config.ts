import type { WebConfig } from "@btc/shared/config";
import { fetchJson } from "./http.ts";

export type { WebConfig };

const NUMBER_KEYS = [
  "nameMaxLength",
  "staleThresholdMs",
  "chartWindowSeconds",
  "resolvePollIntervalMs",
  "predictionWindowSeconds",
] as const;

/** Loaded at startup (never cached) so the build does not depend on the environment. */
export async function loadWebConfig(): Promise<WebConfig> {
  const { response, payload } = await fetchJson("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`config.json answered ${response.status}`);
  if (payload === undefined) throw new Error("config.json is not readable JSON");
  const config = payload as Partial<Record<keyof WebConfig, unknown>>;
  for (const key of NUMBER_KEYS) {
    if (typeof config[key] !== "number" || !(config[key] > 0)) {
      throw new Error(`config.json: ${key} is invalid`);
    }
  }
  for (const key of ["marketProductId", "marketWsUrl"] as const) {
    if (typeof config[key] !== "string" || config[key] === "") {
      throw new Error(`config.json: ${key} is invalid`);
    }
  }
  return config as WebConfig;
}
