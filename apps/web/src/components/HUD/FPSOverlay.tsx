import { useEffect, useState } from "react";
import type { GameEngine } from "../../game/Game";

interface FPSOverlayProps {
  engineRef: { current: { getEngine: () => GameEngine } | null };
}

/** Dev-only performance readout. Throttled to 4 Hz — never per-frame. */
export function FPSOverlay({ engineRef }: FPSOverlayProps) {
  const [stats, setStats] = useState({ fps: 0, particles: 0, remotePlayers: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      const engine = engineRef.current?.getEngine();
      if (engine) setStats(engine.getStats());
    }, 250);
    return () => clearInterval(id);
  }, [engineRef]);

  return (
    <div style={styles.overlay}>
      {stats.fps} FPS · {stats.remotePlayers} remote · {stats.particles} particles
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 90,
    padding: "4px 10px",
    background: "rgba(0,0,0,0.55)",
    color: "#9fe8a2",
    font: "12px/1.4 monospace",
    borderRadius: 4,
    pointerEvents: "none",
    userSelect: "none",
  },
};