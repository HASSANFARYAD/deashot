import React, { useRef, useState, useEffect } from "react";
import type { GameState } from "../game/GameEngine";
import { createGame } from "../game/Game";
import { HUD } from "../components/HUD/HUD";
import { PointerPrompt } from "../components/HUD/PointerPrompt";

interface GamePageProps {
  onExit: () => void;
  online?: boolean;
}

export function GamePage({ onExit, online = false }: GamePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<{ dispose: () => void } | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    ammo: 30,
    reloading: false,
    reloadProgress: 0,
    crosshairVisible: false,
  });
  const [pointerLocked, setPointerLocked] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const game = createGame(
      el,
      (state) => {
        setGameState(state);
      },
      { online }
    );
    engineRef.current = game;

    const onLockChange = () => {
      setPointerLocked(document.pointerLockElement !== null);
    };
    document.addEventListener("pointerlockchange", onLockChange);

    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      game.dispose();
      engineRef.current = null;
    };
  }, [online]);

  return (
    <div style={styles.root}>
      <div ref={containerRef} style={styles.canvas} />
      <HUD state={gameState} />
      <PointerPrompt visible={pointerLocked} />
      <div style={styles.topRight}>
        <button onClick={onExit} style={styles.exitBtn}>
          Exit (Esc)
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  canvas: {
    width: "100%",
    height: "100%",
  },
  topRight: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 100,
  },
  exitBtn: {
    padding: "8px 14px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
};
