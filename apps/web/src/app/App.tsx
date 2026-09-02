import React, { useState } from "react";
import { Home } from "../pages/Home";
import { GamePage } from "../pages/GamePage";

export function App() {
  const [screen, setScreen] = useState<"home" | "game">("home");

  return (
    <div style={styles.root}>
      {screen === "home" ? (
        <Home onPlay={() => setScreen("game")} />
      ) : (
        <GamePage online onExit={() => setScreen("home")} />
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
