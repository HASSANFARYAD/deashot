import React from "react";
import type { GameState } from "../../game/GameEngine";
import { Crosshair } from "./Crosshair";
import { HealthBar } from "./HealthBar";
import { AmmoDisplay } from "./AmmoDisplay";
import { HitMarker } from "./HitMarker";
import { DamageIndicator } from "./DamageIndicator";
import { KillFeed } from "./KillFeed";

interface HUDProps {
  state: GameState;
  crosshairColor?: string;
  hitMarker: { active: boolean; headshot: boolean };
  damageIndicator: { active: boolean; amount: number; headshot: boolean };
  killFeed: Array<{ id: string; killer: string; killerTeam: string; victim: string; victimTeam: string; headshot: boolean; timestamp: number }>;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export const HUD: React.FC<HUDProps> = ({ state, crosshairColor, hitMarker, damageIndicator, killFeed }) => {
  return (
    <>
      <Crosshair visible={state.crosshairVisible} color={crosshairColor} />
      <HitMarker visible={hitMarker.active} headshot={hitMarker.headshot} />
      <DamageIndicator visible={damageIndicator.active} amount={damageIndicator.amount} headshot={damageIndicator.headshot} />
      <KillFeed entries={killFeed} />
      <div style={styles.topCenter}>
        <span style={{ ...styles.teamScore, color: "#5599ff" }}>{state.blueScore}</span>
        <span style={styles.timer}>{state.connected ? formatTime(state.timeRemaining) : "--:--"}</span>
        <span style={{ ...styles.teamScore, color: "#ff5555" }}>{state.redScore}</span>
      </div>
      <div style={styles.topLeft}>
        <HealthBar health={state.health} maxHealth={100} />
      </div>
      <div style={styles.bottomRight}>
        <AmmoDisplay
          ammo={state.ammo}
          maxAmmo={30}
          reloading={state.reloading}
          reloadProgress={state.reloadProgress}
        />
      </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  topLeft: {
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 100,
  },
  bottomRight: {
    position: "absolute",
    bottom: 20,
    right: 20,
    zIndex: 100,
  },
  topCenter: {
    position: "absolute",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    gap: 18,
    background: "rgba(0,0,0,0.45)",
    padding: "6px 16px",
    borderRadius: 6,
  },
  teamScore: {
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  timer: {
    fontSize: 18,
    color: "#fff",
    fontFamily: "monospace",
  },
};
