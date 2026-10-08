import { useRef, useState } from "react";
import { Message } from "../components/ui/Message.tsx";
import { InstructionsDialog } from "../features/instructions/components/InstructionsDialog.tsx";
import { readHideInstructions } from "../features/instructions/preference.ts";
import { Leaderboards } from "../features/leaderboards/components/Leaderboards.tsx";
import { useLeaderboards } from "../features/leaderboards/hooks/useLeaderboards.ts";
import { PriceChart } from "../features/market/components/PriceChart.tsx";
import { PriceDisplay } from "../features/market/components/PriceDisplay.tsx";
import { useFeedAnnouncement } from "../features/market/hooks/useFeedAnnouncement.ts";
import { useMarketFeed } from "../features/market/hooks/useMarketFeed.ts";
import { NameEditor } from "../features/player/components/NameEditor.tsx";
import { useGame } from "../features/player/hooks/useGame.ts";
import { PredictionControls } from "../features/predictions/components/PredictionControls.tsx";
import { PredictionPanel } from "../features/predictions/components/PredictionPanel.tsx";
import { StatsSummary } from "../features/progress/components/StatsSummary.tsx";
import type { WebConfig } from "../lib/config.ts";

/** The game screen: composes the features and owns nothing but layout. */
export function Game({ config }: { config: WebConfig }) {
  const feed = useMarketFeed(config);
  const game = useGame();
  const { snapshot } = game;
  const leaderboards = useLeaderboards(
    snapshot?.token,
    `${snapshot?.lastResult?.id ?? "none"}|${snapshot?.player.displayName ?? ""}`,
  );
  const feedAnnouncement = useFeedAnnouncement(feed.fresh);
  // Game mounts once per page load, so this opens the instructions at most once per load (D14).
  const [instructionsOpen, setInstructionsOpen] = useState(() => !readHideInstructions());
  const howToPlayButton = useRef<HTMLButtonElement>(null);

  if (game.load === "loading") return <Message title="Loading your player…" />;
  if (game.load === "error" || !snapshot) {
    return (
      <Message
        title="Your progress could not be loaded"
        detail="Check your connection and try again. Your saved player is kept."
        onRetry={game.start}
      />
    );
  }

  const { player, activePrediction, lastResult, offsetMs } = snapshot;
  return (
    <>
      <header className="top">
        <h1>BTC Predictor</h1>
        <div className="top-actions">
          <NameEditor
            displayName={player.displayName}
            maxLength={config.nameMaxLength}
            onSave={game.rename}
          />
          <button
            type="button"
            className="btn btn-quiet"
            ref={howToPlayButton}
            onClick={() => setInstructionsOpen(true)}
          >
            How to play
          </button>
        </div>
      </header>
      <InstructionsDialog
        open={instructionsOpen}
        predictionWindowSeconds={config.predictionWindowSeconds}
        onClose={() => {
          setInstructionsOpen(false);
          howToPlayButton.current?.focus();
        }}
      />
      <main className="layout">
        <section className="card market" aria-labelledby="market-heading">
          <h2 id="market-heading">BTC/USD</h2>
          <PriceDisplay feed={feed} />
          <PriceChart
            observations={feed.observations}
            priceCents={feed.priceCents}
            priceAt={feed.priceAt}
            fresh={feed.fresh}
            windowSeconds={config.chartWindowSeconds}
            entryPrice={activePrediction?.entryPrice}
          />
          <PredictionControls
            hasActivePrediction={activePrediction !== null}
            submitting={game.submitting}
            unconfirmed={game.unconfirmed}
            feedFresh={feed.fresh}
            onPredict={game.predict}
          />
        </section>

        <section className="card play" aria-labelledby="play-heading">
          <h2 id="play-heading">Your prediction</h2>
          <PredictionPanel
            active={activePrediction}
            result={lastResult}
            offsetMs={offsetMs}
            livePriceCents={feed.fresh ? feed.priceCents : null}
            predictionError={game.predictionError}
            unconfirmed={game.unconfirmed}
            feedAnnouncement={feedAnnouncement}
            resolvePollIntervalMs={config.resolvePollIntervalMs}
            predictionWindowSeconds={config.predictionWindowSeconds}
            onResolvePoll={game.refresh}
            onConfirm={game.confirmPrediction}
          />
        </section>

        <section className="card stats-card" aria-labelledby="stats-heading">
          <h2 id="stats-heading">Your statistics</h2>
          <StatsSummary player={player} />
        </section>

        <section className="card boards-card" aria-labelledby="boards-heading">
          <h2 id="boards-heading">Leaderboards</h2>
          <Leaderboards leaderboards={leaderboards} player={player} />
        </section>
      </main>
    </>
  );
}
