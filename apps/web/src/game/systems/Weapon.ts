import * as THREE from "three";
import { ASSAULT_RIFLE } from "@deashot/game-config";
import type { FPSCamera } from "./FPSCamera";
import type { CollisionWorld } from "./CollisionWorld";
import type { InputState } from "./InputManager";

export interface WeaponState {
  currentAmmo: number;
  magazineSize: number;
  reloading: boolean;
  reloadProgress: number;
  lastFireTime: number;
  canFire: boolean;
}

export class Weapon {
  private readonly stats = ASSAULT_RIFLE.stats;
  private currentAmmo: number;
  private reloading = false;
  private reloadTimer = 0;
  private lastFireTime = 0;
  private muzzleFlash = 0;
  private model: THREE.Group;
  private muzzlePoint: THREE.PointLight;
  private recoilOffset = 0;
  private aimAmount = 0;

  /** Visual model of the weapon (attached to camera). */
  readonly group: THREE.Group;

  constructor() {
    this.currentAmmo = this.stats.magazineSize;
    this.group = new THREE.Group();
    this.model = this.buildModel();
    this.muzzlePoint = new THREE.PointLight(0xffaa00, 0, 4);
    this.muzzlePoint.position.set(0.06, -0.04, -0.5);
    this.group.add(this.model);
    this.group.add(this.muzzlePoint);
    // Position weapon in lower-right of camera view.
    this.group.position.set(0.25, -0.22, -0.45);
  }

  private buildModel(): THREE.Group {
    const g = new THREE.Group();

    // Gun body.
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.35), bodyMat);
    body.position.set(0, 0, -0.15);
    g.add(body);

    // Barrel.
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.38);
    g.add(barrel);

    // Stock.
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x443322 });
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.12), stockMat);
    stock.position.set(0, -0.01, 0.04);
    g.add(stock);

    // Grip.
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.03), gripMat);
    grip.position.set(0, -0.06, -0.05);
    grip.rotation.x = 0.3;
    g.add(grip);

    // Magazine.
    const magMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.03), magMat);
    mag.position.set(0, -0.08, -0.12);
    mag.rotation.x = 0.1;
    g.add(mag);

    return g;
  }

  /** Returns current weapon state for HUD. */
  getState(): WeaponState {
    return {
      currentAmmo: this.currentAmmo,
      magazineSize: this.stats.magazineSize,
      reloading: this.reloading,
      reloadProgress: this.reloading
        ? 1 - this.reloadTimer / this.stats.reloadTime
        : 0,
      lastFireTime: this.lastFireTime,
      canFire: !this.reloading && this.currentAmmo > 0,
    };
  }

  /** Process input, update weapon state. Returns shoot event or null. */
  update(
    input: InputState,
    dt: number,
    _camera: FPSCamera,
    collision: CollisionWorld,
    onHit: (point: THREE.Vector3, normal: THREE.Vector3) => void,
    _onMiss: (point: THREE.Vector3) => void
  ): { type: "shoot"; origin: THREE.Vector3; point: THREE.Vector3 } | null {
    const now = performance.now() / 1000;
    let shootEvent: { type: "shoot"; origin: THREE.Vector3; point: THREE.Vector3 } | null = null;

    // ADS: move gun toward center screen when aiming.
    const aimTarget = input.aim ? 1 : 0;
    this.aimAmount += (aimTarget - this.aimAmount) * Math.min(1, dt * 12);
    if (Math.abs(this.aimAmount - aimTarget) < 0.01) this.aimAmount = aimTarget;
    const resting = new THREE.Vector3(0.25, -0.22, -0.45);
    const ads = new THREE.Vector3(0, -0.14, -0.33);
    this.group.position.copy(resting).lerp(ads, this.aimAmount);

    // Reload.
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.currentAmmo = this.stats.magazineSize;
      }
    }

    // Trigger reload with R key.
    if (input.reload && !this.reloading && this.currentAmmo < this.stats.magazineSize) {
      this.reloading = true;
      this.reloadTimer = this.stats.reloadTime;
    }

    // Auto-reload when empty.
    if (this.currentAmmo <= 0 && !this.reloading) {
      this.reloading = true;
      this.reloadTimer = this.stats.reloadTime;
    }

    // Fire rate check.
    const fireInterval = 60 / this.stats.fireRate;
    const canFire = !this.reloading && this.currentAmmo > 0 && now - this.lastFireTime >= fireInterval;

    // Shooting.
    if (input.shoot && canFire) {
      this.lastFireTime = now;
      this.currentAmmo--;

      // Muzzle flash.
      this.muzzleFlash = 0.06;

      // Recoil visual.
      this.recoilOffset = 0.03;

      // Hitscan from camera center.
      const ray = new THREE.Ray();
      ray.origin.copy(_camera.camera.position);
      _camera.camera.getWorldDirection(ray.direction);

      // Muzzle world position (weapon is attached to the camera).
      const muzzleWorld = new THREE.Vector3(0.06, -0.05, -0.5);
      muzzleWorld.applyQuaternion(_camera.camera.quaternion);
      muzzleWorld.add(_camera.camera.position);

      // Test against all colliders (simplified: ground + box AABB).
      const hitPoint = new THREE.Vector3();
      const hitNormal = new THREE.Vector3(0, 1, 0);
      const hit = this.raycast(ray, collision, hitPoint, hitNormal);

      if (hit) {
        onHit(hitPoint, hitNormal);
        shootEvent = { type: "shoot", origin: muzzleWorld, point: hitPoint };
      } else {
        // Miss: mark far point.
        const farPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(200));
        _onMiss(farPoint);
        shootEvent = { type: "shoot", origin: muzzleWorld, point: farPoint };
      }
    }

    // Decay muzzle flash.
    if (this.muzzleFlash > 0) {
      this.muzzleFlash -= dt;
      this.muzzlePoint.intensity = this.muzzleFlash > 0 ? 8 : 0;
    }

    // Decay recoil.
    if (this.recoilOffset > 0) {
      this.recoilOffset *= 0.85;
      if (this.recoilOffset < 0.001) this.recoilOffset = 0;
    }

    // Apply weapon bob and recoil to model.
    this.model.position.z = this.recoilOffset;
    this.model.rotation.x = -this.recoilOffset * 2;

    return shootEvent;
  }

  private raycast(
    ray: THREE.Ray,
    collision: CollisionWorld,
    hitPoint: THREE.Vector3,
    hitNormal: THREE.Vector3
  ): boolean {
    // Test ground plane (y=0).
    if (ray.direction.y < 0) {
      const t = -ray.origin.y / ray.direction.y;
      if (t > 0 && t < 200) {
        hitPoint.copy(ray.origin).addScaledVector(ray.direction, t);
        hitNormal.set(0, 1, 0);
        return true;
      }
    }

    // Test each AABB in the collision world.
    const result = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const tempBox = new THREE.Box3();

    for (const mesh of (collision as any).colliders || []) {
      tempBox.min.set(mesh.minX, mesh.minY, mesh.minZ);
      tempBox.max.set(mesh.maxX, mesh.maxY, mesh.maxZ);
      if (ray.intersectBox(tempBox, result)) {
        // Compute face normal.
        const cx = (mesh.minX + mesh.maxX) / 2;
        const cy = (mesh.minY + mesh.maxY) / 2;
        const cz = (mesh.minZ + mesh.maxZ) / 2;
        const dx = result.x - cx;
        const dy = result.y - cy;
        const dz = result.z - cz;
        const hw = (mesh.maxX - mesh.minX) / 2;
        const hh = (mesh.maxY - mesh.minY) / 2;
        const hd = (mesh.maxZ - mesh.minZ) / 2;
        const nx = Math.abs(dx) / hw;
        const ny = Math.abs(dy) / hh;
        const nz = Math.abs(dz) / hd;
        if (ny > nx && ny > nz) normal.set(0, Math.sign(dy), 0);
        else if (nx > nz) normal.set(Math.sign(dx), 0, 0);
        else normal.set(0, 0, Math.sign(dz));

        hitPoint.copy(result);
        hitNormal.copy(normal);
        return true;
      }
    }

    return false;
  }
}
