import * as THREE from "three";
import { clamp, normalizeAngle } from "@deashot/math";
import { EYE_HEIGHT, PITCH_LIMIT } from "@deashot/game-config";
import type { InputState } from "./InputManager";

const MOUSE_SENSITIVITY = 0.003;

const BASE_FOV = 75;
const AIM_FOV = 45;
const FOV_LERP_SPEED = 12;

export class FPSCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0;
  private fov = BASE_FOV;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 500);
    this.camera.position.set(0, EYE_HEIGHT, 0);
  }

  /** Apply mouse look from input. */
  handleInput(input: InputState) {
    if (!input.pointerLocked) return;
    this.yaw = normalizeAngle(this.yaw - input.mouseX * MOUSE_SENSITIVITY);
    this.pitch = clamp(
      this.pitch - input.mouseY * MOUSE_SENSITIVITY,
      -PITCH_LIMIT,
      PITCH_LIMIT
    );
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

  /** Position camera at the player's eye height and apply rotation. */
  update(playerX: number, playerY: number, playerZ: number) {
    this.camera.position.set(playerX, playerY + EYE_HEIGHT, playerZ);

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);
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
