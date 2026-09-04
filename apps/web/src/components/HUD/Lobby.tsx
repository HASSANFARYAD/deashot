import React from "react";
import type { ScoreboardEntry } from "../../game/GameEngine";

interface TeamGroup {
  name: string;
  color: string;
  players: ScoreboardEntry[];
}

interface LobbyProps {
  players: ScoreboardEntry[];
  countdown: number;
  counting: boolean;
  map: string;
  mode: string;
}

export const Lobby: React.FC<LobbyProps> = ({
  players,
  countdown,
  counting,
  map,
  mode,
}) => {
  const groups: TeamGroup[] = [
    { name: "BLUE", color: "#5599ff", players: players.filter((p) => p.team === "blue") },
    { name: "RED", color: "#ff5555", players: players.filter((p) => p.team === "red") },
  ];

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h2 style={styles.title}>MATCH LOBBY</h2>
        <p style={styles.subtitle}>
          {mode.toUpperCase()} · {map}
        </p>

        {counting && countdown > 0 ? (
          <div style={styles.countWrap}>
            <span style={styles.bigNumber}>{Math.ceil(countdown)}</span>
            <span style={styles.goHint}>Get ready…</span>
          </div>
        ) : (
          <p style={styles.waiting}>Waiting for players…</p>
        )}

        <div style={styles.teams}>
          {groups.map((g) => (
            <div key={g.name} style={styles.teamCol}>
              <h3 style={{ ...styles.teamName, color: g.color }}>
                {g.name} ({g.players.length})
              </h3>
              {g.players.length === 0 ? (
                <p style={styles.empty}>—</p>
              ) : (
                g.players.map((p) => (
                  <div key={p.id} style={styles.playerRow}>
                    <span style={styles.playerName}>{p.name}</span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10,10,25,0.8)",
    zIndex: 300,
  },
  card: {
    background: "rgba(20,20,40,0.95)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: "28px 36px",
    minWidth: 360,
    textAlign: "center",
  },
  title: { margin: 0, letterSpacing: 4 },
  subtitle: { margin: "6px 0 20px", opacity: 0.6, fontSize: 13 },
  countWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 20 },
  bigNumber: { fontSize: 72, fontWeight: "bold", color: "#fff" },
  goHint: { opacity: 0.7 },
  waiting: { margin: "0 0 20px", opacity: 0.8, fontStyle: "italic" },
  teams: { display: "flex", gap: 40, justifyContent: "center" },
  teamCol: { textAlign: "left", minWidth: 130 },
  teamName: { margin: "0 0 8px", fontSize: 15, letterSpacing: 2 },
  empty: { opacity: 0.35, margin: 0 },
  playerRow: { padding: "2px 0", fontSize: 14 },
  playerName: { color: "#fff" },
};