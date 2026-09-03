import React from "react";

interface KillFeedEntry {
  id: string;
  killer: string;
  killerTeam: string;
  victim: string;
  victimTeam: string;
  headshot: boolean;
  timestamp: number;
}

interface KillFeedProps {
  entries: KillFeedEntry[];
}

export const KillFeed: React.FC<KillFeedProps> = ({ entries }) => {
  if (entries.length === 0) return null;
  return (
    <div style={styles.container}>
      {entries.map((e) => (
        <div key={e.id} style={styles.entry}>
          <span style={{ color: e.killerTeam === "blue" ? "#5599ff" : "#ff5555", fontWeight: "bold" }}>
            {e.killer}
          </span>
          <span style={styles.weapon}>
            {e.headshot ? " [HS] " : " "}
          </span>
          <span style={{ color: e.victimTeam === "blue" ? "#5599ff" : "#ff5555" }}>
            {e.victim}
          </span>
        </div>
      ))}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    pointerEvents: "none",
  },
  entry: {
    background: "rgba(0,0,0,0.6)",
    padding: "4px 10px",
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#fff",
    whiteSpace: "nowrap",
  },
  weapon: {
    color: "#aaa",
    fontSize: 12,
  },
};
