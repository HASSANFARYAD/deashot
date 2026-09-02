import * as THREE from "three";
import type { SnapshotPlayer } from "../networking/GameSocket";

/**
 * Renders and interpolates remote players from server snapshots.
 *
 * For each remote player we keep a short ring buffer of (time, pos) samples.
 * Each frame we pick the two samples bracketing the current interpolated time
 * and lerp between them, which removes the 20 Hz snapshot "steps" so remote
 * movement looks smooth (no rubber-banding).
 */

interface Sample {
  time: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface Entry {
  mesh: THREE.Group;
  healthBar: THREE.Mesh;
  samples: Sample[];
  last: SnapshotPlayer;
}

const MAX_SAMPLES = 8;

export class RemotePlayers {
  private scene: THREE.Scene;
  private players = new Map<string, Entry>();
  /** Rendering delay; keeps 2 samples present = 50ms @20Hz. */
  private interpDelay = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setInterpolationDelay(delayMs: number) {
    this.interpDelay = delayMs;
  }

  has(sessionId: string): boolean {
    return this.players.has(sessionId);
  }

  keys(): IterableIterator<string> {
    return this.players.keys();
  }

  add(sessionId: string, player: SnapshotPlayer) {
    if (this.players.has(sessionId)) return;

    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: player.team === "red" ? 0xdd3344 : 0x3355dd,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), bodyMat);
    body.position.y = 0.7;
    group.add(body);

    const hpMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    const healthBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.02),
      hpMat
    );
    healthBar.position.y = 1.6;
    group.add(healthBar);

    this.scene.add(group);
    this.players.set(sessionId, { mesh: group, healthBar, samples: [], last: player });
  }

  update(sessionId: string, player: SnapshotPlayer, nowMs: number) {
    const entry = this.players.get(sessionId);
    if (!entry) return;

    entry.last = player;
    entry.samples.push({
      time: nowMs,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
    });
    if (entry.samples.length > MAX_SAMPLES) entry.samples.shift();

    // Health bar width reflects HP ratio.
    const ratio = Math.max(0, Math.min(1, player.health / 100));
    entry.healthBar.scale.x = ratio;
  }

  remove(sessionId: string) {
    const entry = this.players.get(sessionId);
    if (!entry) {
      this.players.delete(sessionId);
      return;
    }
    this.scene.remove(entry.mesh);
    this.players.delete(sessionId);
  }

  /**
   * Advance remote players each frame. Positions are evaluated at
   * `interpDelay` ms behind the local clock (so the server snapshot has time
   * to arrive), then lerped between the two samples bracketing that time.
   */
  updateFrame(nowMs: number) {
    const renderTime = nowMs - this.interpDelay;
    for (const { mesh, samples } of this.players.values()) {
      if (samples.length < 2) {
        const s = samples[samples.length - 1];
        if (s) mesh.position.set(s.x, s.y, s.z);
        continue;
      }

      let a = samples[0];
      let b = samples[1];
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].time <= renderTime) {
          a = samples[i - 1];
          b = samples[i];
        }
      }
      if (b.time === a.time) continue;

      const t = Math.max(
        0,
        Math.min(1, (renderTime - a.time) / (b.time - a.time))
      );
      mesh.position.set(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t
      );
      mesh.rotation.order = "YXZ";
      mesh.rotation.set(b.pitch, b.yaw, 0);
    }
  }

  clear() {
    for (const key of Array.from(this.players.keys())) this.remove(key);
  }

  dispose() {
    this.clear();
  }
}
