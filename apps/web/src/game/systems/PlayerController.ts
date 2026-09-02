import * as THREE from "three";
import {
  PLAYER_SPEED,
  PLAYER_AIM_SPEED_FACTOR,
  PLAYER_ACCELERATION,
  PLAYER_FRICTION,
  PLAYER_JUMP_VELOCITY,
  GRAVITY,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_MAX_HEALTH,
} from "@deashot/game-config";
import type { InputState } from "./InputManager";
import type { FPSCamera } from "./FPSCamera";
import type { CollisionWorld } from "./CollisionWorld";

export class PlayerController {
  readonly position = new THREE.Vector3(0, 0, 0);
  readonly velocity = new THREE.Vector3(0, 0, 0);
  health = PLAYER_MAX_HEALTH;

  private grounded = false;

  constructor(
    private camera: FPSCamera,
    private collision: CollisionWorld
  ) {}

  /** Read input and integrate physics for one tick. */
  update(input: InputState, dt: number) {
    const [camFwdX, camFwdZ] = this.camera.getForwardXZ();

    // Build movement direction from WASD relative to camera facing.
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
    // Strafe: perpendicular to forward (right hand rule, Y-up).
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

    // Normalize horizontal movement and apply acceleration.
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
      const accel = PLAYER_ACCELERATION * (input.aim ? PLAYER_AIM_SPEED_FACTOR : 1);
      this.velocity.x += moveX * accel * dt;
      this.velocity.z += moveZ * accel * dt;
    }

    // Friction.
    const friction = PLAYER_FRICTION * dt;
    this.velocity.x *= Math.max(0, 1 - friction);
    this.velocity.z *= Math.max(0, 1 - friction);

    // Clamp horizontal speed.
    const hSpeed = Math.sqrt(
      this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
    );
    const maxSpeed = PLAYER_SPEED * (input.aim ? PLAYER_AIM_SPEED_FACTOR : 1);
    if (hSpeed > maxSpeed) {
      this.velocity.x = (this.velocity.x / hSpeed) * maxSpeed;
      this.velocity.z = (this.velocity.z / hSpeed) * maxSpeed;
    }

    // Jump.
    if (input.jump && this.grounded) {
      this.velocity.y = PLAYER_JUMP_VELOCITY;
      this.grounded = false;
    }

    // Gravity.
    this.velocity.y += GRAVITY * dt;

    // Integrate position.
    const newX = this.position.x + this.velocity.x * dt;
    const newY = this.position.y + this.velocity.y * dt;
    const newZ = this.position.z + this.velocity.z * dt;

    // Collision with world.
    const resolved = this.collision.resolve(
      newX,
      newY,
      newZ,
      PLAYER_RADIUS,
      PLAYER_HEIGHT
    );
    this.position.set(resolved.x, resolved.y, resolved.z);

    // Ground check.
    this.grounded = resolved.y <= 0.01;

    // Kill downward velocity when grounded.
    if (this.grounded && this.velocity.y < 0) {
      this.velocity.y = 0;
    }

    // Update camera.
    this.camera.update(this.position.x, this.position.y, this.position.z);
  }

  spawn(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.health = PLAYER_MAX_HEALTH;
  }
}
