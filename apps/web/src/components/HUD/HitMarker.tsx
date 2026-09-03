import React from "react";

interface HitMarkerProps {
  visible: boolean;
  headshot: boolean;
}

export const HitMarker: React.FC<HitMarkerProps> = ({ visible, headshot }) => {
  if (!visible) return null;
  const color = headshot ? "#ff3333" : "#ffffff";
  return (
    <div style={styles.container}>
      <svg width="24" height="24" viewBox="0 0 24 24">
        <line x1="4" y1="4" x2="10" y2="10" stroke={color} strokeWidth="2" />
        <line x1="20" y1="4" x2="14" y2="10" stroke={color} strokeWidth="2" />
        <line x1="4" y1="20" x2="10" y2="14" stroke={color} strokeWidth="2" />
        <line x1="20" y1="20" x2="14" y2="14" stroke={color} strokeWidth="2" />
      </svg>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: 200,
    pointerEvents: "none",
  },
};
