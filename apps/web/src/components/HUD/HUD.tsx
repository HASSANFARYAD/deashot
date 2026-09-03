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
  hitMarker: { active: boolean; headshot: boolean };
  damageIndicator: { active: boolean; amount: number; headshot: boolean };
  killFeed: Array<{ id: string; killer: string; killerTeam: string; victim: string; victimTeam: string; headshot: boolean; timestamp: number }>;
}

export const HUD: React.FC<HUDProps> = ({ state, hitMarker, damageIndicator, killFeed }) => {
  return (
    <>
      <Crosshair visible={state.crosshairVisible} />
      <HitMarker visible={hitMarker.active} headshot={hitMarker.headshot} />
      <DamageIndicator visible={damageIndicator.active} amount={damageIndicator.amount} headshot={damageIndicator.headshot} />
      <KillFeed entries={killFeed} />
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
};
