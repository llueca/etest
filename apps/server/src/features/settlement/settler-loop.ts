export interface SettlerLoopDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** One settlement pass (runSettlementPass). */
  pass(now: Date): Promise<void>;
  /** Is any prediction pending that becomes eligible before `timestamp`? */
  hasPendingBefore(timestamp: number): Promise<boolean>;
}

/**
 * The settler Lambda's body (design D3): evaluate, then poll roughly every
 * `pollIntervalMs` until the run ends, but exit early once no pending prediction
 * can become eligible before the run's end. The next EventBridge tick covers the rest.
 * A failing pass or check is logged and the loop keeps polling: one transient error
 * must not delay every due prediction until the next tick.
 */
export async function runSettlerLoop(
  deps: SettlerLoopDeps,
  options: { runMs: number; pollIntervalMs: number },
): Promise<void> {
  const runEnd = deps.now() + options.runMs;
  while (true) {
    try {
      await deps.pass(new Date(deps.now()));
    } catch (error) {
      logFailure("settlement_pass_failed", error);
    }
    if (deps.now() + options.pollIntervalMs >= runEnd) return;
    if (!(await hasPendingOrUnknown(deps, runEnd))) return;
    await deps.sleep(options.pollIntervalMs);
  }
}

/** If the check fails, keep polling: something may be due. */
async function hasPendingOrUnknown(deps: SettlerLoopDeps, runEnd: number): Promise<boolean> {
  try {
    return await deps.hasPendingBefore(runEnd);
  } catch (error) {
    logFailure("pending_check_failed", error);
    return true;
  }
}

const logFailure = (event: string, error: unknown) =>
  console.error(
    JSON.stringify({
      level: "error",
      event,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
