import React from "react";
import type { GameState } from "../../game/GameEngine";
import { Crosshair } from "./Crosshair";
import { HealthBar } from "./HealthBar";
import { AmmoDisplay } from "./AmmoDisplay";

interface HUDProps {
  state: GameState;
}

export const HUD: React.FC<HUDProps> = ({ state }) => {
  return (
    <>
      <Crosshair visible={state.crosshairVisible} />
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
