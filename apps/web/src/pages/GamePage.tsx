import React, { useRef, useState, useEffect, useCallback } from "react";
import type { GameState } from "../game/GameEngine";
import type { ServerHitEvent, ServerKillEvent, ServerDamageEvent } from "../game/Game";
import { createGame } from "../game/Game";
import type { ProfileSettings } from "../settings/api";
import { HUD } from "../components/HUD/HUD";
import { PointerPrompt } from "../components/HUD/PointerPrompt";
import { Scoreboard } from "../components/HUD/Scoreboard";
import { MatchEnd } from "../components/HUD/MatchEnd";
import { Lobby } from "../components/HUD/Lobby";
import { LoadingOverlay } from "../components/HUD/LoadingOverlay";
import { PauseMenu } from "../components/HUD/PauseMenu";

interface GamePageProps {
  onExit: () => void;
  online?: boolean;
  token?: string;
  settings: ProfileSettings;
  onSaveSettings: (patch: Partial<ProfileSettings>) => void;
}

export function GamePage({
  onExit,
  online = false,
  token,
  settings,
  onSaveSettings,
}: GamePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<{ dispose: () => void } | null>(null);
  const [playSession, setPlaySession] = useState(0);
  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    ammo: 30,
    reloading: false,
    reloadProgress: 0,
    crosshairVisible: false,
    phase: "waiting",
    timeRemaining: 0,
    countdown: 0,
    blueScore: 0,
    redScore: 0,
    winner: "",
    myId: "",
    myTeam: "",
    connected: false,
    players: [],
  });
  const [pointerLocked, setPointerLocked] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hitMarker, setHitMarker] = useState<{ active: boolean; headshot: boolean }>({ active: false, headshot: false });
  const [damageIndicator, setDamageIndicator] = useState<{ active: boolean; amount: number; headshot: boolean }>({ active: false, amount: 0, headshot: false });
  const [killFeed, setKillFeed] = useState<Array<{ id: string; killer: string; killerTeam: string; victim: string; victimTeam: string; headshot: boolean; timestamp: number }>>([]);

  const handleHit = useCallback((event: ServerHitEvent) => {
    setHitMarker({ active: true, headshot: event.headshot });
    setTimeout(() => setHitMarker({ active: false, headshot: false }), 150);
  }, []);

  const handleKill = useCallback((event: ServerKillEvent) => {
    setKillFeed((prev) => {
      const entry = {
        id: `${event.killerId}-${event.victimId}-${Date.now()}`,
        killer: event.killerName,
        killerTeam: event.killerTeam,
        victim: event.victimName,
        victimTeam: event.victimTeam,
        headshot: event.headshot,
        timestamp: Date.now(),
      };
      return [entry, ...prev].slice(0, 5);
    });
  }, []);

  const handleDamage = useCallback((event: ServerDamageEvent) => {
    setDamageIndicator({ active: true, amount: event.amount, headshot: event.headshot });
    setTimeout(() => setDamageIndicator({ active: false, amount: 0, headshot: false }), 500);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const game = createGame(
      el,
      {
        onStateChange: setGameState,
        onHit: handleHit,
        onKill: handleKill,
        onDamage: handleDamage,
      },
      { online, token }
    );

    // Apply the player's saved settings to the engine (sensitivity).
    const engine = game.getEngine();
    engine.applySettings({ sensitivity: settings.sensitivity });
    engineRef.current = game;

    // Expose for automated browser tests (Playwright) to introspect the scene.
    (window as any).__deashotEngine = engine;

    const onLockChange = () => {
      setPointerLocked(document.pointerLockElement !== null);
    };
    document.addEventListener("pointerlockchange", onLockChange);

    // ESC toggles pause (once the match is actually in play).
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onEsc);

    return () => {
      window.removeEventListener("keydown", onEsc);
      document.removeEventListener("pointerlockchange", onLockChange);
      game.dispose();
      engineRef.current = null;
    };
  }, [online, token, settings.sensitivity, handleHit, handleKill, handleDamage, playSession]);

  const handlePlayAgain = useCallback(() => {
    setKillFeed([]);
    setHitMarker({ active: false, headshot: false });
    setDamageIndicator({ active: false, amount: 0, headshot: false });
    setScoreboardOpen(false);
    setPaused(false);
    setPlaySession((s) => s + 1);
  }, []);

  // Clean up old kill feed entries.
  useEffect(() => {
    if (killFeed.length === 0) return;
    const timer = setTimeout(() => {
      setKillFeed((prev) => prev.filter((e) => Date.now() - e.timestamp < 5000));
    }, 5500);
    return () => clearTimeout(timer);
  }, [killFeed]);

  // Tab toggles the scoreboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        setScoreboardOpen(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Tab") setScoreboardOpen(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const inWarmup = gameState.phase === "warmup";
  const inPlay = gameState.connected && gameState.phase === "in-progress";
  const ended = gameState.connected && gameState.phase === "ended";

  return (
    <div style={styles.root}>
      <div ref={containerRef} style={styles.canvas} />

      <HUD state={gameState} crosshairColor={settings.crosshairColor} hitMarker={hitMarker} damageIndicator={damageIndicator} killFeed={killFeed} />

      {/* Lobby + countdown while the match warms up. */}
      {inWarmup && (
        <Lobby
          players={gameState.players}
          countdown={gameState.countdown}
          counting={gameState.countdown > 0}
          map="Arena"
          mode="TDM"
        />
      )}

      {/* Loading screen on first connect / rejoin until we have a snapshot. */}
      {gameState.connected && !inWarmup && !ended && gameState.players.length === 0 && !paused && (
        <LoadingOverlay map="Arena" ready={false} />
      )}

      {inPlay && (
        <Scoreboard
          visible={scoreboardOpen && !paused}
          players={gameState.players}
          blueScore={gameState.blueScore}
          redScore={gameState.redScore}
          timeRemaining={gameState.timeRemaining}
          myId={gameState.myId}
        />
      )}

      {ended && (
        <MatchEnd
          winner={gameState.winner}
          blueScore={gameState.blueScore}
          redScore={gameState.redScore}
          players={gameState.players}
          myId={gameState.myId}
          onPlayAgain={handlePlayAgain}
          onHome={onExit}
        />
      )}

      {paused && inPlay && (
        <PauseMenu
          settings={settings}
          onSaveSettings={onSaveSettings}
          onResume={() => setPaused(false)}
          onLeave={onExit}
        />
      )}

      <PointerPrompt visible={pointerLocked} />

      {!paused && !ended && (
        <div style={styles.topRight}>
          <button onClick={onExit} style={styles.exitBtn}>
            Exit (Esc)
          </button>
        </div>
      )}
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