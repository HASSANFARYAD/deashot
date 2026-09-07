import * as THREE from "three";
import { clamp, normalizeAngle } from "@deashot/math";
import { EYE_HEIGHT, PITCH_LIMIT, SHAKE_FIRE } from "@deashot/game-config";
import type { InputState } from "./InputManager";

const MOUSE_SENSITIVITY = 0.003;
const RECOIL_DECAY = 8;
const SHAKE_DECAY = 6;

const BASE_FOV = 75;
const AIM_FOV = 45;
const FOV_LERP_SPEED = 12;

export class FPSCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0;
  private fov = BASE_FOV;
  private sensitivity = 1;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 500);
    this.camera.position.set(0, EYE_HEIGHT, 0);
  }

  /** Set the mouse-sensitivity multiplier (1 = default). */
  setSensitivity(value: number) {
    this.sensitivity = value;
  }

  /** Apply mouse look from input. */
  handleInput(input: InputState) {
    if (!input.pointerLocked) return;
    const sens = MOUSE_SENSITIVITY * this.sensitivity;
    this.yaw = normalizeAngle(this.yaw - input.mouseX * sens);
    this.pitch = clamp(
      this.pitch - input.mouseY * sens,
      -PITCH_LIMIT,
      PITCH_LIMIT
    );
  }

  /** Kick the camera by a recoil offset (radians) plus a small fire shake. */
  addKick(pitch: number, yaw: number) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
    this.shake = Math.min(1, this.shake + SHAKE_FIRE);
  }

  /** Add screen shake (0..1 scale). Used when the player takes damage. */
  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Set aspect ratio on resize. */
  setAspect(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Smoothly zoom toward ADS FOV when aiming. */
  updateAim(aiming: boolean, dt: number) {
    const target = aiming ? AIM_FOV : BASE_FOV;
    this.fov += (target - this.fov) * Math.min(1, FOV_LERP_SPEED * dt);
    if (Math.abs(this.fov - target) < 0.1) this.fov = target;
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Position camera at the player's eye height, apply rotation + recoil/shake. */
  update(playerX: number, playerY: number, playerZ: number, dt = 0.016) {
    this.camera.position.set(playerX, playerY + EYE_HEIGHT, playerZ);

    // Fresh per-frame jitter whenever shake is active.
    if (this.shake > 0) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    const euler = new THREE.Euler(
      this.pitch + this.recoilPitch + this.shakeY,
      this.yaw + this.recoilYaw + this.shakeX,
      0,
      "YXZ"
    );
    this.camera.quaternion.setFromEuler(euler);

    // Decay recoil kick and shake.
    this.recoilPitch *= Math.exp(-RECOIL_DECAY * dt);
    this.recoilYaw *= Math.exp(-RECOIL_DECAY * dt);
    this.shake *= Math.exp(-SHAKE_DECAY * dt);
    if (this.shake < 0.0005) this.shake = 0;
  }

  /** Get the camera's forward direction in world space (horizontal only). */
  getForwardXZ(): [number, number] {
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  }

  /** Get the look direction vector. */
  getDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }
}
