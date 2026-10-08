import { useEffect, useState } from "react";
import { Message } from "../components/ui/Message.tsx";
import { loadWebConfig, type WebConfig } from "../lib/config.ts";
import { Game } from "./Game.tsx";

/** Loads config.json (never cached), then starts the game. */
export function App() {
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);

  const loadConfig = () => {
    setConfigFailed(false);
    loadWebConfig().then(setConfig, () => setConfigFailed(true));
  };
  useEffect(loadConfig, []);

  if (configFailed) {
    return (
      <Message
        title="The game is not configured correctly"
        detail="The configuration could not be loaded or is invalid."
        onRetry={loadConfig}
      />
    );
  }
  if (!config) return <Message title="Loading…" />;
  return <Game config={config} />;
}
