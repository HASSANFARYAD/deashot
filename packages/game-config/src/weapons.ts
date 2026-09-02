/**
 * Data-driven weapon configuration.
 * New weapons = new config entries + optional behavior hooks.
 */

export interface WeaponStats {
  /** Rounds per minute. 0 = semi-auto. */
  fireRate: number;
  magazineSize: number;
  /** Seconds. */
  reloadTime: number;
  /** Meters. */
  range: number;
  /** Radians of random spread. */
  spread: number;
  recoilVertical: number;
  recoilHorizontal: number;
  /** Base damage per hit. */
  damage: number;
  /** Damage multiplier on headshot. */
  headMultiplier: number;
}

export interface WeaponConfig {
  id: string;
  name: string;
  stats: WeaponStats;
}

export const ASSAULT_RIFLE: WeaponConfig = {
  id: "ar",
  name: "Assault Rifle",
  stats: {
    fireRate: 600,
    magazineSize: 30,
    reloadTime: 2.1,
    range: 200,
    spread: 0.02,
    recoilVertical: 0.03,
    recoilHorizontal: 0.01,
    damage: 25,
    headMultiplier: 2,
  },
};

export const WEAPONS: Record<string, WeaponConfig> = {
  [ASSAULT_RIFLE.id]: ASSAULT_RIFLE,
};

export function getWeapon(id: string): WeaponConfig {
  const weapon = WEAPONS[id];
  if (!weapon) {
    throw new Error(`Unknown weapon: ${id}`);
  }
  return weapon;
}
