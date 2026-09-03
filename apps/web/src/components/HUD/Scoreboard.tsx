import React from "react";
import type { ScoreboardEntry } from "../../game/GameEngine";

interface ScoreboardProps {
  visible: boolean;
  players: ScoreboardEntry[];
  blueScore: number;
  redScore: number;
  timeRemaining: number;
  myId: string;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  visible,
  players,
  blueScore,
  redScore,
  timeRemaining,
  myId,
}) => {
  if (!visible) return null;
  const blue = players
    .filter((p) => p.team === "blue")
    .sort((a, b) => b.kills - a.kills);
  const red = players
    .filter((p) => p.team === "red")
    .sort((a, b) => b.kills - a.kills);

  const team = (members: ScoreboardEntry[], color: string, score: number) => (
    <div style={styles.teamCol}>
      <div style={{ ...styles.teamHeader, color }}>
        {color === "blue" ? "BLUE" : "RED"} — {score}
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Player</th>
            <th style={styles.th}>K</th>
            <th style={styles.th}>D</th>
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr>
              <td style={styles.td} colSpan={3}>
                —
              </td>
            </tr>
          ) : (
            members.map((p) => (
              <tr key={p.id}>
                <td style={styles.td}>
                  {p.id === myId ? <b>{p.name} (you)</b> : p.name}
                  {!p.alive ? " *" : ""}
                </td>
                <td style={styles.td}>{p.kills}</td>
                <td style={styles.td}>{p.deaths}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={styles.backdrop}>
      <div style={styles.title}>SCOREBOARD</div>
      <div style={styles.timer}>{formatTime(timeRemaining)}</div>
      <div style={styles.row}>
        {team(blue, "blue", blueScore)}
        {team(red, "red", redScore)}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "absolute",
    inset: 0,
    zIndex: 200,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    pointerEvents: "none",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 3,
    color: "#fff",
    textShadow: "0 0 8px rgba(255,255,255,0.4)",
  },
  timer: {
    fontSize: 18,
    color: "#ddd",
    fontFamily: "monospace",
  },
  row: {
    display: "flex",
    gap: 40,
    alignItems: "flex-start",
  },
  teamCol: {
    minWidth: 260,
    background: "rgba(20,20,30,0.85)",
    borderRadius: 8,
    padding: 12,
  },
  teamHeader: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 8,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    color: "#aaa",
    fontSize: 12,
    padding: "2px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
  },
  td: {
    textAlign: "left",
    color: "#fff",
    fontSize: 13,
    padding: "3px 6px",
  },
};
