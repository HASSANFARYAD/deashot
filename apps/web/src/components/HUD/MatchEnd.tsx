import React from "react";
import type { ScoreboardEntry } from "../../game/GameEngine";

interface MatchEndProps {
  winner: string;
  blueScore: number;
  redScore: number;
  players: ScoreboardEntry[];
  myId: string;
  onPlayAgain: () => void;
  onHome: () => void;
}

export const MatchEnd: React.FC<MatchEndProps> = ({
  winner,
  blueScore,
  redScore,
  players,
  myId,
  onPlayAgain,
  onHome,
}) => {
  const blue = players
    .filter((p) => p.team === "blue")
    .sort((a, b) => b.kills - a.kills);
  const red = players
    .filter((p) => p.team === "red")
    .sort((a, b) => b.kills - a.kills);

  const winnerLabel =
    winner === "blue"
      ? "BLUE WINS"
      : winner === "red"
      ? "RED WINS"
      : "DRAW";

  const team = (members: ScoreboardEntry[], color: string, score: number) => (
    <div style={styles.teamCol}>
      <div style={{ ...styles.teamHeader, color: color === "blue" ? "#5599ff" : "#ff5555" }}>
        {color === "blue" ? "BLUE" : "RED"} — {score}
      </div>
      {members.map((p) => (
        <div key={p.id} style={styles.row}>
          <span style={styles.name}>
            {p.id === myId ? `${p.name} (you)` : p.name}
          </span>
          <span style={styles.kd}>
            {p.kills} / {p.deaths}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={styles.backdrop}>
      <div style={styles.title}>{winnerLabel}</div>
      <div style={styles.scores}>
        {blueScore} — {redScore}
      </div>
      <div style={styles.columns}>
        {team(blue, "blue", blueScore)}
        {team(red, "red", redScore)}
      </div>
      <div style={styles.actions}>
        <button onClick={onPlayAgain} style={styles.btnPrimary}>
          Play Again
        </button>
        <button onClick={onHome} style={styles.btnSecondary}>
          Back to Home
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "absolute",
    inset: 0,
    zIndex: 300,
    background: "rgba(0,0,0,0.78)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    letterSpacing: 6,
    color: "#fff",
    textShadow: "0 0 16px rgba(255,255,255,0.5)",
  },
  scores: {
    fontSize: 28,
    color: "#ddd",
    fontFamily: "monospace",
  },
  columns: {
    display: "flex",
    gap: 40,
    alignItems: "flex-start",
  },
  teamCol: {
    minWidth: 240,
    background: "rgba(20,20,30,0.9)",
    borderRadius: 8,
    padding: 14,
  },
  teamHeader: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    padding: "3px 0",
  },
  name: { color: "#fff" },
  kd: { color: "#aaa", fontFamily: "monospace" },
  actions: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  btnPrimary: {
    padding: "10px 22px",
    fontSize: 16,
    fontWeight: "bold",
    background: "#2f81f7",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "10px 22px",
    fontSize: 16,
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 6,
    cursor: "pointer",
  },
};
