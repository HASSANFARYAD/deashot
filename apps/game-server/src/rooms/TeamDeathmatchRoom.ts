import { Client, Room } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { MAX_PLAYERS, MATCH_DURATION, KILL_LIMIT } from "@deashot/shared";
import {
  PLAYER_MAX_HEALTH,
  PLAYER_SPEED,
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_JUMP_VELOCITY,
  GRAVITY,
  MAP_SPAWNS,
  MAP_BOUNDS,
  ASSAULT_RIFLE,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "@deashot/game-config";

/** Syncable player state schema sent to all clients. */
export class PlayerStateSchema extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") team: "blue" | "red" = "blue";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") yaw: number = 0;
  @type("number") pitch: number = 0;
  @type("number") health: number = PLAYER_MAX_HEALTH;
  @type("number") maxHealth: number = PLAYER_MAX_HEALTH;
  @type("boolean") alive: boolean = true;
  @type("number") kills: number = 0;
  @type("number") deaths: number = 0;
  @type("number") ammo: number = 30;
  @type("boolean") reloading: boolean = false;
}

/** Syncable match state schema. */
export class MatchStateSchema extends Schema {
  @type("string") id: string = "";
  @type("string") mode: string = "tdm";
  @type("string") map: string = "arena";
  @type("string") phase: "waiting" | "in-progress" | "ended" = "waiting";
  @type("number") timeRemaining: number = MATCH_DURATION;
  @type("number") blueScore: number = 0;
  @type("number") redScore: number = 0;
  @type("string") winner: "blue" | "red" | "" = "";
  @type({ map: PlayerStateSchema }) players = new MapSchema<PlayerStateSchema>();
}

/** Non-synced per-player simulation state. */
interface SimPlayer {
  velX: number;
  velY: number;
  velZ: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawnAt: number;
  yaw: number;
  pitch: number;
  lastFireTime: number;
  reloadTimer: number;
}

interface PendingInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  yaw: number;
  pitch: number;
  shoot: boolean;
  reload: boolean;
}

const SPAWNS = MAP_SPAWNS;

export class TeamDeathmatchRoom extends Room<MatchStateSchema> {
  maxClients = MAX_PLAYERS;

  private sim = new Map<string, SimPlayer>();
  private inputs = new Map<string, PendingInput>();
  private timeRemaining = MATCH_DURATION;
  private phase: "waiting" | "in-progress" | "ended" = "waiting";
  private killLimit = KILL_LIMIT;

  onCreate(options: any) {
    this.setState(new MatchStateSchema());
    this.state.id = `tdm-${this.roomId}`;

    // Optional per-room overrides (e.g. for fast integration tests).
    const opts = options ?? {};
    this.killLimit = typeof opts.killLimit === "number" && opts.killLimit > 0
      ? opts.killLimit
      : KILL_LIMIT;
    if (typeof opts.duration === "number" && opts.duration > 0) {
      this.timeRemaining = opts.duration;
      this.state.timeRemaining = opts.duration;
    }

    this.setSimulationInterval((dt) => this.onTick(dt), 1000 / 60);

    this.onMessage("input", (client, input: any) => {
      if (!input || typeof input !== "object") return;
      this.inputs.set(client.sessionId, {
        forward: !!input.forward,
        backward: !!input.backward,
        left: !!input.left,
        right: !!input.right,
        jump: !!input.jump,
        yaw: isFinite(input.yaw) ? input.yaw : 0,
        pitch: isFinite(input.pitch) ? input.pitch : 0,
        shoot: !!input.shoot,
        reload: !!input.reload,
      });
    });

    this.onMessage("shoot", (client, msg: any) => {
      if (!msg || typeof msg !== "object") return;
      if (typeof msg.ox !== "number" || typeof msg.oy !== "number" || typeof msg.oz !== "number") return;
      if (typeof msg.dx !== "number" || typeof msg.dy !== "number" || typeof msg.dz !== "number") return;
      this.handleShoot(client.sessionId, msg);
    });
  }

  onJoin(client: Client) {
    const name = (client as any).auth?.username || client.sessionId.slice(0, 6);
    const blueCount = this.playerCountOf("blue");
    const redCount = this.playerCountOf("red");
    const team: "blue" | "red" = blueCount <= redCount ? "blue" : "red";
    const spawn = SPAWNS[team][blueCount % SPAWNS[team].length];

    const p = new PlayerStateSchema();
    p.id = client.sessionId;
    p.name = name;
    p.team = team;
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.health = PLAYER_MAX_HEALTH;
    p.alive = true;
    this.state.players.set(client.sessionId, p);

    this.sim.set(client.sessionId, {
      velX: 0,
      velY: 0,
      velZ: 0,
      alive: true,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
      yaw: 0,
      pitch: 0,
      lastFireTime: 0,
      reloadTimer: 0,
    });

    // Auto-start when enough players join (MVP: start on first join for testing).
    if (this.state.phase === "waiting") {
      this.state.phase = "in-progress";
      this.phase = "in-progress";
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.sim.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
  }

  onDispose() {
    this.sim.clear();
    this.inputs.clear();
  }

  private playerCountOf(team: "blue" | "red"): number {
    let n = 0;
    for (const p of this.state.players.values()) {
      if (p.team === team) n++;
    }
    return n;
  }

  private onTick(dt: number) {
    if (this.phase === "ended") return;

    if (this.phase === "in-progress") {
      this.timeRemaining -= dt / 1000;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.endMatch();
        return;
      }
      this.state.timeRemaining = this.timeRemaining;
    }

    const h = 1 / 60;
    for (const [id, p] of this.state.players) {
      const s = this.sim.get(id);
      if (!s) continue;
      const input = this.inputs.get(id);

      // Rotation always applies even while dead.
      if (input) {
        s.yaw = input.yaw;
        s.pitch = input.pitch;
        p.yaw = input.yaw;
        p.pitch = input.pitch;
      }

      if (!p.alive) {
        // Respawn dead players.
        if (s.respawnAt > 0 && Date.now() / 1000 >= s.respawnAt) {
          s.alive = true;
          p.alive = true;
          p.health = PLAYER_MAX_HEALTH;
          p.ammo = ASSAULT_RIFLE.stats.magazineSize;
          p.reloading = false;
          s.reloadTimer = 0;
          const spawn = SPAWNS[p.team as "blue" | "red"][s.deaths % (SPAWNS[p.team as "blue" | "red"].length)];
          p.x = spawn.x;
          p.y = spawn.y;
          p.z = spawn.z;
          s.velX = 0;
          s.velY = 0;
          s.velZ = 0;
        }
        continue;
      }

      // Weapon reload timer.
      if (s.reloadTimer > 0) {
        s.reloadTimer -= h;
        if (s.reloadTimer <= 0) {
          s.reloadTimer = 0;
          p.reloading = false;
          p.ammo = ASSAULT_RIFLE.stats.magazineSize;
        }
      }
      // Auto-reload when empty.
      if (p.ammo <= 0 && !p.reloading && s.reloadTimer <= 0) {
        s.reloadTimer = ASSAULT_RIFLE.stats.reloadTime;
        p.reloading = true;
      }

      if (!input) continue;

      // Movement (camera-relative, matching the client prediction convention:
      // forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))).
      const yaw = s.yaw;
      const camFwdX = -Math.sin(yaw);
      const camFwdZ = -Math.cos(yaw);
      let moveX = 0;
      let moveZ = 0;
      if (input.forward) {
        moveX += camFwdX;
        moveZ += camFwdZ;
      }
      if (input.backward) {
        moveX -= camFwdX;
        moveZ -= camFwdZ;
      }
      const rightX = -camFwdZ;
      const rightZ = camFwdX;
      if (input.right) {
        moveX += rightX;
        moveZ += rightZ;
      }
      if (input.left) {
        moveX -= rightX;
        moveZ -= rightZ;
      }

      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 0) {
        moveX /= len;
        moveZ /= len;
        s.velX += moveX * PLAYER_ACCELERATION * h;
        s.velZ += moveZ * PLAYER_ACCELERATION * h;
      }

      const friction = PLAYER_FRICTION * h;
      s.velX *= Math.max(0, 1 - friction);
      s.velZ *= Math.max(0, 1 - friction);

      const hSpeed = Math.sqrt(s.velX * s.velX + s.velZ * s.velZ);
      if (hSpeed > PLAYER_SPEED) {
        s.velX = (s.velX / hSpeed) * PLAYER_SPEED;
        s.velZ = (s.velZ / hSpeed) * PLAYER_SPEED;
      }

      if (input.jump && p.y <= 0.01) {
        s.velY = PLAYER_JUMP_VELOCITY;
      }
      s.velY += GRAVITY * h;

      p.x += s.velX * h;
      p.y += s.velY * h;
      p.z += s.velZ * h;

      if (p.y < 0) {
        p.y = 0;
        s.velY = 0;
      }

      // Clamp to map bounds so authority matches client renderer.
      const limit = MAP_BOUNDS.halfExtent;
      p.x = Math.max(-limit, Math.min(limit, p.x));
      p.z = Math.max(-limit, Math.min(limit, p.z));
    }
  }

  private handleShoot(
    sessionId: string,
    msg: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
  ) {
    const p = this.state.players.get(sessionId);
    const s = this.sim.get(sessionId);
    if (!p || !s) return;
    if (!p.alive) return;
    if (this.phase !== "in-progress") return;

    const now = Date.now() / 1000;
    const stats = ASSAULT_RIFLE.stats;

    // Fire rate check.
    const fireInterval = 60 / stats.fireRate;
    if (now - s.lastFireTime < fireInterval) return;

    // Ammo check.
    if (p.ammo <= 0 || s.reloadTimer > 0) return;

    // Fire!
    s.lastFireTime = now;
    p.ammo--;

    // Auto-reload when empty.
    if (p.ammo <= 0) {
      s.reloadTimer = stats.reloadTime;
      p.reloading = true;
    }

    // Normalize direction.
    const len = Math.sqrt(msg.dx * msg.dx + msg.dy * msg.dy + msg.dz * msg.dz);
    if (len < 0.001) return;
    const dx = msg.dx / len;
    const dy = msg.dy / len;
    const dz = msg.dz / len;

    // Hitscan raycast against all alive players.
    const origin = { x: msg.ox, y: msg.oy, z: msg.oz };
    const direction = { x: dx, y: dy, z: dz };

    let closestT = stats.range;
    let closestId: string | null = null;
    let headshot = false;

    for (const [id, target] of this.state.players) {
      if (id === sessionId) continue;
      if (!target.alive) continue;
      // Friendly fire off.
      if (target.team === p.team) continue;

      const hit = this.raycastPlayerCapsule(origin, direction, target);
      if (hit && hit.t < closestT) {
        closestT = hit.t;
        closestId = id;
        headshot = hit.headshot;
      }
    }

    if (closestId) {
      const victim = this.state.players.get(closestId);
      const victimSim = this.sim.get(closestId);
      if (!victim || !victimSim) return;

      const damage = headshot ? stats.damage * stats.headMultiplier : stats.damage;
      victim.health = Math.max(0, victim.health - damage);

      // Broadcast hit to shooter.
      this.broadcast("hit", {
        attackerId: sessionId,
        victimId: closestId,
        damage,
        headshot,
        newHealth: victim.health,
      }, { except: [] });

      // Broadcast damage to victim (for damage indicator).
      this.broadcast("damage", {
        targetId: closestId,
        attackerId: sessionId,
        attackerName: p.name,
        amount: damage,
        headshot,
        newHealth: victim.health,
      }, { except: [] });

      // Kill check.
      if (victim.health <= 0) {
        victim.alive = false;
        victimSim.alive = false;
        victimSim.respawnAt = now + 3; // RESPAWN_DELAY = 3
        victimSim.deaths++;
        s.kills++;
        p.kills = s.kills;
        victim.deaths = victimSim.deaths;

        // Update scores.
        if (p.team === "blue") this.state.blueScore++;
        else this.state.redScore++;

        // Broadcast kill event.
        this.broadcast("kill", {
          killerId: sessionId,
          killerName: p.name,
          killerTeam: p.team,
          victimId: closestId,
          victimName: victim.name,
          victimTeam: victim.team,
          headshot,
          weaponId: ASSAULT_RIFLE.id,
        });

        // Win by kill limit.
        if (
          this.state.blueScore >= this.killLimit ||
          this.state.redScore >= this.killLimit
        ) {
          this.endMatch();
        }
      }
    }
  }

  /** Ray-vs-capsule intersection. Returns hit info or null. */
  private raycastPlayerCapsule(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    target: PlayerStateSchema
  ): { t: number; headshot: boolean } | null {
    // Player capsule: center at (x, y + PLAYER_HEIGHT/2, z), radius PLAYER_RADIUS, height PLAYER_HEIGHT.
    const cx = target.x;
    const cz = target.z;

    // Ray vs infinite cylinder along Y axis.
    const ocx = origin.x - cx;
    const ocz = origin.z - cz;
    const a = direction.x * direction.x + direction.z * direction.z;
    const b = 2 * (ocx * direction.x + ocz * direction.z);
    const c = ocx * ocx + ocz * ocz - PLAYER_RADIUS * PLAYER_RADIUS;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    let t = (-b - sqrtDisc) / (2 * a);
    if (t < 0) t = (-b + sqrtDisc) / (2 * a);
    if (t < 0 || t > 200) return null;

    // Check Y bounds of capsule.
    const hitY = origin.y + direction.y * t;
    if (hitY < target.y || hitY > target.y + PLAYER_HEIGHT) return null;

    // Headshot: hit above 85% of capsule height.
    const headshot = hitY > target.y + PLAYER_HEIGHT * 0.85;
    return { t, headshot };
  }

  private endMatch() {
    this.phase = "ended";
    this.state.phase = "ended";
    let winner: "blue" | "red" | "" = "";
    if (this.state.blueScore > this.state.redScore) winner = "blue";
    else if (this.state.redScore > this.state.blueScore) winner = "red";
    this.state.winner = winner;
    this.broadcast("match-ended", {
      winner,
      blueScore: this.state.blueScore,
      redScore: this.state.redScore,
    });
  }
}
