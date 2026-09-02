import React from "react";

interface AmmoDisplayProps {
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  reloadProgress: number;
}

export const AmmoDisplay: React.FC<AmmoDisplayProps> = ({
  ammo,
  maxAmmo,
  reloading,
  reloadProgress,
}) => {
  return (
    <div style={styles.container}>
      {reloading ? (
        <div style={styles.reloadBar}>
          <div style={{ ...styles.reloadFill, width: `${reloadProgress * 100}%` }} />
          <span style={styles.reloadText}>RELOADING</span>
        </div>
      ) : (
        <span style={styles.ammo}>
          {ammo} / {maxAmmo}
        </span>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
  },
  ammo: {
    fontSize: 32,
    fontWeight: "bold",
    fontFamily: "monospace",
    color: "#fff",
    textShadow: "0 2px 4px rgba(0,0,0,0.5)",
  },
  reloadBar: {
    width: 160,
    height: 24,
    background: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    position: "relative",
    overflow: "hidden",
  },
  reloadFill: {
    height: "100%",
    background: "#2196f3",
    borderRadius: 4,
    transition: "width 0.05s linear",
  },
  reloadText: {
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
