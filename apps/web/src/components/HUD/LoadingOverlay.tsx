import React, { useEffect, useState } from "react";

interface LoadingOverlayProps {
  /** Map name shown while loading. */
  map: string;
  /** Fade out / unmount once gameplay is ready. */
  ready: boolean;
}

const TIPS = [
  "You move with WASD and look with your mouse.",
  "Right-click zooms (ADS) and slows you down for accuracy.",
  "Headshots deal double damage.",
  "Hold R to reload; empty mags reload automatically.",
  "Hold Tab for the scoreboard.",
  "Work with your team to hit the kill limit first.",
  "Stay near cover — friendly fire is off, enemies are red.",
];

const TIP_INTERVAL = 4000;

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ map, ready }) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // Briefly show the map then fade away.
    const t = setTimeout(() => setHidden(true), 1200);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), TIP_INTERVAL);
    return () => clearInterval(t);
  }, [ready]);

  if (hidden) return null;

  return (
    <div style={styles.wrap}>
      <h1 style={styles.title}>DEASHOT</h1>
      <p style={styles.map}>Map · {map}</p>
      <p style={styles.tip}>{TIPS[tipIndex]}</p>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "rgba(10,10,25,0.92)",
    zIndex: 200,
    transition: "opacity 300ms ease",
  },
  title: {
    margin: 0,
    letterSpacing: 8,
    fontSize: 40,
  },
  map: {
    margin: 0,
    opacity: 0.7,
  },
  tip: {
    margin: 0,
    maxWidth: 420,
    textAlign: "center",
    opacity: 0.85,
  },
};