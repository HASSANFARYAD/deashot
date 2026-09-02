import * as THREE from "three";

interface Particle {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
  gravity: boolean;
}

/**
 * Lightweight particle effects system.
 * Manages muzzle flashes, bullet impacts, and other visual effects.
 */
export class Effects {
  private scene: THREE.Scene;
  private particles: Particle[] = [];

  private readonly impactGeo = new THREE.SphereGeometry(0.03, 4, 4);
  private readonly impactMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Show a muzzle flash at the given world position. */
  muzzleFlash(position: THREE.Vector3) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.9 })
    );
    flash.position.copy(position);
    this.scene.add(flash);

    this.particles.push({
      mesh: flash,
      velocity: new THREE.Vector3(),
      lifetime: 0.05,
      maxLifetime: 0.05,
      gravity: false,
    });
  }

  /** Show a bullet impact at the hit point. */
  bulletImpact(point: THREE.Vector3, normal: THREE.Vector3) {
    const impact = new THREE.Mesh(this.impactGeo, this.impactMat.clone());
    impact.position.copy(point).addScaledVector(normal, 0.01);
    this.scene.add(impact);

    this.particles.push({
      mesh: impact,
      velocity: normal.clone().multiplyScalar(2),
      lifetime: 0.3,
      maxLifetime: 0.3,
      gravity: false,
    });

    // Spawn a few sparks.
    for (let i = 0; i < 3; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 3, 3),
        new THREE.MeshBasicMaterial({ color: 0xff8800 })
      );
      spark.position.copy(point).addScaledVector(normal, 0.02);
      this.scene.add(spark);

      const vel = normal.clone();
      vel.x += (Math.random() - 0.5) * 2;
      vel.y += (Math.random() - 0.5) * 2;
      vel.z += (Math.random() - 0.5) * 2;
      vel.normalize().multiplyScalar(4);

      this.particles.push({
        mesh: spark,
        velocity: vel,
        lifetime: 0.2 + Math.random() * 0.2,
        maxLifetime: 0.4,
        gravity: true,
      });
    }
  }

  /** Show a visible bullet tracer traveling from muzzle to target. */
  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const length = dir.length();
    if (length < 0.01) return;

    const lifetime = 0.09;
    const streak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, length, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true })
    );
    dir.normalize();
    streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    streak.position.copy(from);
    this.scene.add(streak);

    this.particles.push({
      mesh: streak,
      velocity: dir.clone().multiplyScalar(length / lifetime),
      lifetime,
      maxLifetime: lifetime,
      gravity: false,
    });
  }

  /** Update all particles. */
  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime -= dt;

      if (p.lifetime <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      // Move.
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Fade.
      const mat = (p.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = p.lifetime / p.maxLifetime;
      mat.transparent = mat.opacity < 0.99;

      // Gravity on sparks.
      if (p.gravity) p.velocity.y -= 9.8 * dt;
    }
  }

  dispose() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
    }
    this.particles = [];
  }
}
