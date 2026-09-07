import React from "react";

interface CrosshairProps {
  visible: boolean;
  color?: string;
  /** Normalized 0..1 spread — widens the gap between arms. */
  spread?: number;
}

export const Crosshair: React.FC<CrosshairProps> = ({ visible, color = "#00ff00", spread = 0 }) => {
  if (!visible) return null;
  const gap = 6 + Math.max(0, Math.min(1, spread)) * 22;
  return (
    <div style={styles.container}>
      <div style={{ ...styles.dot, background: color }} />
      <div style={{ ...styles.line, ...{ top: -gap, left: "50%", transform: "translateX(-50%)", background: color } }} />
      <div style={{ ...styles.line, ...{ bottom: -gap, left: "50%", transform: "translateX(-50%)", background: color } }} />
      <div style={{ ...styles.lineH, ...{ left: -gap, top: "50%", transform: "translateY(-50%)", background: color } }} />
      <div style={{ ...styles.lineH, ...{ right: -gap, top: "50%", transform: "translateY(-50%)", background: color } }} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 100,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.9)",
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
  line: {
    position: "absolute",
    width: 2,
    height: 8,
    background: "rgba(255,255,255,0.7)",
  },
  lineH: {
    position: "absolute",
    width: 8,
    height: 2,
    background: "rgba(255,255,255,0.7)",
  },
};