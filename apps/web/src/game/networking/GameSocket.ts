import { Client, Room } from "colyseus.js";
import type { PlayerInput } from "@deashot/shared";
import { CLIENT_INPUT_RATE } from "@deashot/shared";

/**
 * Thin typed wrapper around a Colyseus room connection.
 * Owns the socket, sends player input at the configured rate, and surfaces
 * room state / player add-remove-change events to the game engine.
 *
 * The server schema (MatchStateSchema) is what colyseus exposes as `room.state`.
 * We read it through the schema change listeners and project a plain typed
 * mirror for the consumer.
 */

export interface SnapshotPlayer {
  id: string;
  name: string;
  team: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  alive: boolean;
  health: number;
  kills: number;
  deaths: number;
  ammo: number;
  reloading: boolean;
}

export interface MatchSnapshot {
  phase: string;
  timeRemaining: number;
  blueScore: number;
  redScore: number;
  winner: string;
  players: Record<string, SnapshotPlayer>;
}

export interface ServerHitEvent {
  attackerId: string;
  victimId: string;
  damage: number;
  headshot: boolean;
  newHealth: number;
}

export interface ServerKillEvent {
  killerId: string;
  killerName: string;
  killerTeam: string;
  victimId: string;
  victimName: string;
  victimTeam: string;
  headshot: boolean;
  weaponId: string;
}

export interface ServerDamageEvent {
  targetId: string;
  attackerId: string;
  attackerName: string;
  amount: number;
  headshot: boolean;
  newHealth: number;
}

export interface GameSocketCallbacks {
  onSnapshot?: (snapshot: MatchSnapshot) => void;
  onPlayerAdd?: (player: SnapshotPlayer) => void;
  onPlayerChange?: (player: SnapshotPlayer) => void;
  onPlayerRemove?: (sessionId: string) => void;
  onHit?: (event: ServerHitEvent) => void;
  onKill?: (event: ServerKillEvent) => void;
  onDamage?: (event: ServerDamageEvent) => void;
  onClose?: () => void;
}

function readPlayer(p: any): SnapshotPlayer {
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    alive: p.alive,
    health: p.health,
    kills: p.kills,
    deaths: p.deaths,
    ammo: p.ammo,
    reloading: p.reloading,
  };
}

export class GameSocket {
  private client: Client;
  private room: Room | null = null;
  private sessionIdValue = "";
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private lastInput: PlayerInput | null = null;
  private mirror: MatchSnapshot = {
    phase: "waiting",
    timeRemaining: 0,
    blueScore: 0,
    redScore: 0,
    winner: "",
    players: {},
  };
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  readonly callbacks: GameSocketCallbacks;

  constructor(callbacks: GameSocketCallbacks = {}) {
    this.client = new Client("ws://localhost:2567");
    this.callbacks = callbacks;
  }

  get sessionId(): string {
    return this.sessionIdValue;
  }

  get connected(): boolean {
    return this.room !== null;
  }

  /** Join the TDM room and wire schema change listeners. */
  async connect(): Promise<void> {
    this.room = await this.client.joinOrCreate("tdm");
    this.sessionIdValue = this.room.sessionId;

    const state = this.room.state as any;

    const players: Record<string, SnapshotPlayer> = {};
    const refreshPlayers = () => {
      if (!state.players) return;
      for (const [sid, p] of state.players) {
        players[sid] = readPlayer(p);
      }
    };

    // Emit a snapshot periodically to drive reconciliation + interpolation.
    // (The remote-player snapshot source is the periodic timer below; we also
    // nudge on any schema change when available.)
    const update = () => {
      refreshPlayers();
      this.mirror = {
        phase: state.phase,
        timeRemaining: state.timeRemaining,
        blueScore: state.blueScore,
        redScore: state.redScore,
        winner: state.winner ?? "",
        players: { ...players },
      };
      this.callbacks.onSnapshot?.(this.mirror);
    };

    if (typeof state.onChange === "function") {
      // Colyseus `onChange` returns an unsubscribe fn.
      (state as any).__phase2Unsub?.();
      (state as any).__phase2Unsub = state.onChange(update);
    }

    // Periodic snapshot to drive interpolation + reconciliation (50 Hz poll).
    this.snapshotTimer = setInterval(update, 1000 / 50);

    // Listen for combat events.
    this.room.onMessage("hit", (event: ServerHitEvent) => {
      this.callbacks.onHit?.(event);
    });
    this.room.onMessage("kill", (event: ServerKillEvent) => {
      this.callbacks.onKill?.(event);
    });
    this.room.onMessage("damage", (event: ServerDamageEvent) => {
      this.callbacks.onDamage?.(event);
    });

    this.room.onLeave(() => {
      if (this.inputTimer) clearInterval(this.inputTimer);
      if (this.snapshotTimer) clearInterval(this.snapshotTimer);
      this.inputTimer = null;
      this.snapshotTimer = null;
      this.callbacks.onClose?.();
    });

    // Start the input send loop.
    this.inputTimer = setInterval(
      () => this.flushInput(),
      1000 / CLIENT_INPUT_RATE
    );
  }

  /** Queue the latest input to send on the next interval tick. */
  sendInput(input: Omit<PlayerInput, "sequence">) {
    this.sequence++;
    this.lastInput = { ...input, sequence: this.sequence };
  }

  /** Send a shoot event (muzzle origin + direction) to the server. */
  sendShoot(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    if (!this.room) return;
    this.room.send("shoot", { ox, oy, oz, dx, dy, dz });
  }

  private flushInput() {
    if (!this.room || !this.lastInput) return;
    this.room.send("input", this.lastInput);
    this.lastInput = null;
  }

  requestRespawn() {
    this.room?.send("respawn", {});
  }

  async leave() {
    if (this.inputTimer) clearInterval(this.inputTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.inputTimer = null;
    this.snapshotTimer = null;
    await this.room?.leave();
    this.room = null;
  }
}
