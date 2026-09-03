import React from "react";

interface DamageIndicatorProps {
  visible: boolean;
  amount: number;
  headshot: boolean;
}

export const DamageIndicator: React.FC<DamageIndicatorProps> = ({ visible, amount, headshot }) => {
  if (!visible) return null;
  return (
    <div style={styles.overlay}>
      <div style={styles.flash} />
      <div style={styles.damageText}>
        -{amount}
        {headshot && <span style={styles.headshot}> HEADSHOT</span>}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  flash: {
    position: "absolute",
    inset: 0,
    border: "4px solid rgba(255, 0, 0, 0.5)",
    borderRadius: 4,
  },
  damageText: {
    position: "absolute",
    top: "30%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    color: "#ff3333",
    fontSize: 28,
    fontWeight: "bold",
    textShadow: "0 0 6px rgba(255,0,0,0.8)",
    fontFamily: "monospace",
  },
  headshot: {
    color: "#ffaa00",
    fontSize: 18,
    marginLeft: 6,
  },
};
