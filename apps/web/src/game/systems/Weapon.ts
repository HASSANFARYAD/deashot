import * as THREE from "three";
import {
  ASSAULT_RIFLE,
  MAP_COLLIDERS,
  PLAYER_SPEED,
  BOB_FREQ,
  BOB_AMP,
  RECOIL_PITCH,
  RECOIL_YAW,
  MUZZLE_FLASH_DURATION,
  MUZZLE_FLASH_LIGHT,
  MUZZLE_FLASH_SPRITE_SCALE,
} from "@deashot/game-config";
import type { FPSCamera } from "./FPSCamera";
import type { InputState } from "./InputManager";

export interface WeaponState {
  currentAmmo: number;
  magazineSize: number;
  reloading: boolean;
  reloadProgress: number;
  lastFireTime: number;
  canFire: boolean;
}

export interface ShootEvent {
  type: "shoot";
  origin: THREE.Vector3;
  point: THREE.Vector3;
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
  private muzzleFlashSprite: THREE.Sprite;
  private muzzleLocal = new THREE.Vector3(0.06, -0.05, -0.5);
  private recoilOffset = 0;
  private aimAmount = 0;
  private moveHSpeed = 0;
  private bobPhase = 0;
  private bobAmount = 0;

  /** Visual model of the weapon (attached to camera). */
  readonly group: THREE.Group;

  constructor() {
    this.currentAmmo = this.stats.magazineSize;
    this.group = new THREE.Group();
    this.model = this.buildModel();
    this.muzzlePoint = new THREE.PointLight(0xffaa00, 0, 4);
    this.muzzlePoint.position.copy(this.muzzleLocal);
    this.muzzleFlashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.makeFlashTexture(),
        color: 0xffcc88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      })
    );
    // Scale 0 keeps cacheSize > 0 so the sprite exists; hidden until fire.
    this.muzzleFlashSprite.scale.setScalar(0.001);
    this.muzzleFlashSprite.position.copy(this.muzzleLocal);
    this.group.add(this.model);
    this.group.add(this.muzzlePoint);
    this.group.add(this.muzzleFlashSprite);
    // Position weapon in lower-right of camera view.
    this.group.position.set(0.25, -0.22, -0.45);
  }

  /** Procedural radial-glow texture for the flash sprite (no asset needed). */
  private makeFlashTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,200,120,0.7)");
    g.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
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

  /** Normalized (0..1) crosshair spread for the HUD. */
  getSpread(): number {
    const timeSinceShot = performance.now() / 1000 - this.lastFireTime;
    const bloom =
      this.lastFireTime > 0 && timeSinceShot < 0.25
        ? (1 - timeSinceShot / 0.25) * 0.02
        : 0;
    const moveFactor = Math.min(1, this.moveHSpeed / PLAYER_SPEED) * 0.02;
    const raw =
      (this.stats.spread + moveFactor + bloom) * (1 - 0.5 * this.aimAmount);
    return Math.max(0, Math.min(1, raw / 0.08));
  }

  /** Process input, update weapon state. Returns shoot event or null. */
  update(
    input: InputState,
    dt: number,
    _camera: FPSCamera,
    onHit: (point: THREE.Vector3, normal: THREE.Vector3) => void,
    _onMiss: (point: THREE.Vector3) => void,
    move: { hSpeed: number; grounded: boolean },
    onKick?: (pitch: number, yaw: number) => void,
    onReload?: (phase: "start" | "complete") => void
  ): ShootEvent | null {
    const now = performance.now() / 1000;
    let shootEvent: ShootEvent | null = null;
    this.moveHSpeed = move.hSpeed;

    // ADS: move gun toward center screen when aiming.
    const aimTarget = input.aim ? 1 : 0;
    this.aimAmount += (aimTarget - this.aimAmount) * Math.min(1, dt * 12);
    if (Math.abs(this.aimAmount - aimTarget) < 0.01) this.aimAmount = aimTarget;

    // Weapon bob while walking (suppressed while ADS / airborne / still).
    const bobEnabled = !input.aim && move.grounded && move.hSpeed >= 0.1;
    if (bobEnabled) this.bobPhase += move.hSpeed * dt * BOB_FREQ;
    this.bobAmount += ((bobEnabled ? 1 : 0) - this.bobAmount) * Math.min(1, dt * 10);
    const bobX = Math.sin(this.bobPhase) * BOB_AMP * this.bobAmount;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * BOB_AMP * this.bobAmount;

    const resting = new THREE.Vector3(0.25, -0.22, -0.45);
    const ads = new THREE.Vector3(0, -0.14, -0.33);
    const base = resting.clone().lerp(ads, this.aimAmount);
    this.group.position.set(base.x + bobX, base.y + bobY, base.z);

    // Reload.
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.currentAmmo = this.stats.magazineSize;
        onReload?.("complete");
      }
    }

    // Trigger reload with R key.
    if (input.reload && !this.reloading && this.currentAmmo < this.stats.magazineSize) {
      this.reloading = true;
      this.reloadTimer = this.stats.reloadTime;
      onReload?.("start");
    }

    // Auto-reload when empty.
    if (this.currentAmmo <= 0 && !this.reloading) {
      this.reloading = true;
      this.reloadTimer = this.stats.reloadTime;
      onReload?.("start");
    }

    // Fire rate check.
    const fireInterval = 60 / this.stats.fireRate;
    const canFire = !this.reloading && this.currentAmmo > 0 && now - this.lastFireTime >= fireInterval;

    // Shooting.
    if (input.shoot && canFire) {
      this.lastFireTime = now;
      this.currentAmmo--;

      // Muzzle flash (sprite + light spike).
      this.muzzleFlash = MUZZLE_FLASH_DURATION;
      this.muzzleFlashSprite.scale.setScalar(MUZZLE_FLASH_SPRITE_SCALE);
      (this.muzzleFlashSprite.material as THREE.SpriteMaterial).opacity = 1;

      // Recoil visual.
      this.recoilOffset = 0.03;
      onKick?.(RECOIL_PITCH, (Math.random() - 0.5) * 2 * RECOIL_YAW);

      // Hitscan from camera center.
      const ray = new THREE.Ray();
      ray.origin.copy(_camera.camera.position);
      _camera.camera.getWorldDirection(ray.direction);

      // Muzzle world position (weapon is attached to the camera).
      const muzzleWorld = this.muzzleLocal.clone();
      muzzleWorld.applyQuaternion(_camera.camera.quaternion);
      muzzleWorld.add(_camera.camera.position);

      // Test against ground + all world colliders, keep nearest hit.
      const hitPoint = new THREE.Vector3();
      const hitNormal = new THREE.Vector3(0, 1, 0);
      const hit = this.raycast(ray, hitPoint, hitNormal);

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

    // Decay muzzle flash: light + sprite fade together (spike 0 → HIGH → 0).
    if (this.muzzleFlash > 0) {
      this.muzzleFlash -= dt;
      const ratio = Math.max(0, this.muzzleFlash / MUZZLE_FLASH_DURATION);
      this.muzzlePoint.intensity = ratio * ratio * MUZZLE_FLASH_LIGHT;
      const spriteMat = this.muzzleFlashSprite.material as THREE.SpriteMaterial;
      spriteMat.opacity = ratio;
      this.muzzleFlashSprite.scale.setScalar(MUZZLE_FLASH_SPRITE_SCALE * ratio);
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
    hitPoint: THREE.Vector3,
    hitNormal: THREE.Vector3
  ): boolean {
    let bestT = Infinity;
    let found = false;
    const tempBox = new THREE.Box3();
    const result = new THREE.Vector3();
    const normal = new THREE.Vector3();

    // Test ground plane (y = 0).
    if (ray.direction.y < 0) {
      const t = -ray.origin.y / ray.direction.y;
      if (t > 0 && t < bestT) {
        bestT = t;
        hitPoint.copy(ray.origin).addScaledVector(ray.direction, t);
        hitNormal.set(0, 1, 0);
        found = true;
      }
    }

    // Test every world collider, keep the nearest hit.
    for (const c of MAP_COLLIDERS) {
      tempBox.min.set(c.cx - c.hw, c.cy - c.hh, c.cz - c.hd);
      tempBox.max.set(c.cx + c.hw, c.cy + c.hh, c.cz + c.hd);
      if (ray.intersectBox(tempBox, result)) {
        const t = ray.origin.distanceTo(result);
        if (t < bestT) {
          bestT = t;
          hitPoint.copy(result);
          // Compute face normal from hit point relative to box centre.
          const dx = result.x - c.cx;
          const dy = result.y - c.cy;
          const dz = result.z - c.cz;
          const adx = Math.abs(dx) / c.hw;
          const ady = Math.abs(dy) / c.hh;
          const adz = Math.abs(dz) / c.hd;
          if (adx >= ady && adx >= adz) normal.set(Math.sign(dx), 0, 0);
          else if (ady >= adz) normal.set(0, Math.sign(dy), 0);
          else normal.set(0, 0, Math.sign(dz));
          hitNormal.copy(normal);
          found = true;
        }
      }
    }

    return found;
  }
}