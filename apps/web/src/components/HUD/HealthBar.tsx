import React from "react";

interface HealthBarProps {
  health: number;
  maxHealth: number;
}

export const HealthBar: React.FC<HealthBarProps> = ({ health, maxHealth }) => {
  const pct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const color =
    pct > 60 ? "#4caf50" : pct > 30 ? "#ff9800" : "#f44336";

  return (
    <div style={styles.bar}>
      <div style={{ ...styles.fill, width: `${pct}%`, background: color }} />
      <span style={styles.label}>{health}</span>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  bar: {
    width: 200,
    height: 20,
    background: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    position: "relative",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.1s, background 0.2s",
  },
  label: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
};
