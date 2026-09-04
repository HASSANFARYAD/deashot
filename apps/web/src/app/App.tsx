import React, { useState } from "react";
import { Home } from "../pages/Home";
import { GamePage } from "../pages/GamePage";
import { useProfileSettings } from "../settings/useProfileSettings";

export function App() {
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [token, setToken] = useState<string | null>(null);
  const { settings, save: saveSettings } = useProfileSettings(token ?? undefined);

  // Remount key so "Play Again" and re-joining produce a fresh game.
  const [gameKey, setGameKey] = useState(0);

  const goHome = () => {
    setScreen("home");
  };

  return (
    <div style={styles.root}>
      {screen === "home" ? (
        <Home
          onPlay={(nextToken) => {
            setToken(nextToken);
            setScreen("game");
            setGameKey((k) => k + 1);
          }}
        />
      ) : (
        <GamePage
          key={`game-${gameKey}`}
          online
          token={token ?? undefined}
          settings={settings}
          onSaveSettings={saveSettings}
          onExit={goHome}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "fixed",
    inset: 0,
    background: "#0f0f1f",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
  },
};