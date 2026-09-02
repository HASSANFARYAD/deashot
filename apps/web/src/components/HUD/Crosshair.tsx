import React from "react";

interface CrosshairProps {
  visible: boolean;
}

export const Crosshair: React.FC<CrosshairProps> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div style={styles.container}>
      <div style={styles.dot} />
      <div style={{ ...styles.line, top: -10, left: "50%", transform: "translateX(-50%)" }} />
      <div style={{ ...styles.line, bottom: -10, left: "50%", transform: "translateX(-50%)" }} />
      <div style={{ ...styles.lineH, left: -10, top: "50%", transform: "translateY(-50%)" }} />
      <div style={{ ...styles.lineH, right: -10, top: "50%", transform: "translateY(-50%)" }} />
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
