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
 */
export async function runSettlerLoop(
  deps: SettlerLoopDeps,
  options: { runMs: number; pollIntervalMs: number },
): Promise<void> {
  const runEnd = deps.now() + options.runMs;
  while (true) {
    await deps.pass(new Date(deps.now()));
    if (deps.now() + options.pollIntervalMs >= runEnd) return;
    if (!(await deps.hasPendingBefore(runEnd))) return;
    await deps.sleep(options.pollIntervalMs);
  }
}
