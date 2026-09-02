import React from "react";

interface PointerPromptProps {
  visible: boolean;
}

export const PointerPrompt: React.FC<PointerPromptProps> = ({ visible }) => {
  if (visible) return null;
  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <div style={styles.title}>Click to Play</div>
        <div style={styles.controls}>
          <div><b>WASD</b> — Move</div>
          <div><b>Mouse</b> — Look</div>
          <div><b>Left Click</b> — Shoot</div>
          <div><b>R</b> — Reload</div>
          <div><b>Space</b> — Jump</div>
        </div>
        <div style={styles.hint}>Click anywhere to lock mouse and start playing</div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
    zIndex: 200,
    cursor: "pointer",
  },
  box: {
    background: "rgba(20,20,40,0.9)",
    padding: "40px 50px",
    borderRadius: 12,
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.2)",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#fff",
  },
  controls: {
    fontSize: 16,
    lineHeight: 1.8,
    color: "#ccc",
    textAlign: "left",
    marginBottom: 20,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
};
