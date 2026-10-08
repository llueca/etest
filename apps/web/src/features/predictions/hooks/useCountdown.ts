import { useEffect, useState } from "react";

export interface Countdown {
  /** Whole seconds to eligibleAt, rounded up, never negative. null without a prediction. */
  secondsLeft: number | null;
  /** The prediction is eligible but not yet settled. */
  resolving: boolean;
}

/** Derived from the server's eligibleAt and the corrected clock; never a local 60-second count. */
export function useCountdown(eligibleAt: number | undefined, offsetMs: number): Countdown {
  const compute = () =>
    eligibleAt === undefined
      ? null
      : Math.max(0, Math.ceil((eligibleAt - (Date.now() + offsetMs)) / 1000));
  const [secondsLeft, setSecondsLeft] = useState(compute);

  // biome-ignore lint/correctness/useExhaustiveDependencies: compute only reads eligibleAt and offsetMs
  useEffect(() => {
    setSecondsLeft(compute());
    if (eligibleAt === undefined) return;
    const timer = setInterval(() => setSecondsLeft(compute()), 250);
    return () => clearInterval(timer);
  }, [eligibleAt, offsetMs]);

  return { secondsLeft, resolving: secondsLeft !== null && secondsLeft <= 0 };
}
