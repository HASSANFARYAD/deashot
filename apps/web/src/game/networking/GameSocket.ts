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
}

export interface MatchSnapshot {
  phase: string;
  timeRemaining: number;
  blueScore: number;
  redScore: number;
  players: Record<string, SnapshotPlayer>;
}

export interface GameSocketCallbacks {
  onSnapshot?: (snapshot: MatchSnapshot) => void;
  onPlayerAdd?: (player: SnapshotPlayer) => void;
  onPlayerChange?: (player: SnapshotPlayer) => void;
  onPlayerRemove?: (sessionId: string) => void;
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

    if (state.players) {
      // Player appears / updates / leaves.
      state.players.onAdd = (p: any) => {
        players[p.id] = readPlayer(p);
        refreshPlayers();
        this.callbacks.onPlayerAdd?.(readPlayer(p));
        this.emitSnapshot();
      };
      state.players.onChange = (p: any, _key: string) => {
        players[p.id] = readPlayer(p);
        refreshPlayers();
        this.callbacks.onPlayerChange?.(readPlayer(p));
      };
      state.players.onRemove = (p: any) => {
        delete players[p.id];
        this.callbacks.onPlayerRemove?.(p.id);
        this.emitSnapshot();
      };
    }

    // Emit a snapshot periodically at the server snapshot rate so the local
    // player reconciliation stays in sync. Refresh on any schema change too.
    const update = () => {
      refreshPlayers();
      this.mirror = {
        phase: state.phase,
        timeRemaining: state.timeRemaining,
        blueScore: state.blueScore,
        redScore: state.redScore,
        players: { ...players },
      };
      this.callbacks.onSnapshot?.(this.mirror);
    };

    if (typeof state.onChange === "function") {
      // Re-create each connect: Colyseus `onChange` returns an unsubscribe fn.
      (state as any).__phase2Unsub?.();
      (state as any).__phase2Unsub = state.onChange(update);
    }

    // Periodic snapshot to drive interpolation + reconciliation.
    this.snapshotTimer = setInterval(update, 1000 / 50);

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

  private emitSnapshot() {
    this.callbacks.onSnapshot?.(this.mirror);
  }

  /** Queue the latest input to send on the next interval tick. */
  sendInput(input: Omit<PlayerInput, "sequence">) {
    this.sequence++;
    this.lastInput = { ...input, sequence: this.sequence };
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
