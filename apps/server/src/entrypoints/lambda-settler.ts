import { createContext } from "../context.ts";
import { hasPendingBefore, runSettlementPass } from "../features/settlement/settlement.ts";
import { runSettlerLoop } from "../features/settlement/settler-loop.ts";

const RUN_MS = 60_000;

const ctx = createContext();

// Invoked every minute by EventBridge (design D3). Idle invocations exit after one query.
export const handler = async (): Promise<void> => {
  await runSettlerLoop(
    {
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      pass: (now) => runSettlementPass(now, ctx),
      hasPendingBefore: (timestamp) => hasPendingBefore(ctx, timestamp),
    },
    { runMs: RUN_MS, pollIntervalMs: ctx.config.settlementPollIntervalMs },
  );
};
