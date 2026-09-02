import * as THREE from "three";
import { InputManager } from "./systems/InputManager";
import { FPSCamera } from "./systems/FPSCamera";
import { PlayerController } from "./systems/PlayerController";
import { Weapon } from "./systems/Weapon";
import { Effects } from "./systems/Effects";
import { CollisionWorld } from "./systems/CollisionWorld";
import { buildMap } from "./map/ArenaMap";

export interface GameState {
  health: number;
  ammo: number;
  reloading: boolean;
  reloadProgress: number;
  crosshairVisible: boolean;
}

export interface GameCallbacks {
  onStateChange?: (state: GameState) => void;
}

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private input: InputManager;
  private camera: FPSCamera;
  private player: PlayerController;
  private weapon: Weapon;
  private effects: Effects;
  private collision: CollisionWorld;
  private callbacks: GameCallbacks;
  private running = false;
  private lastTime = 0;
  private fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private stateInterval: ReturnType<typeof setInterval> | null = null;
  private onClick: (() => void) | null = null;

  constructor(container: HTMLElement, callbacks: GameCallbacks = {}) {
    this.callbacks = callbacks;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Renderer.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Scene.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 80, 150);

    // Lighting.
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);

    // Systems.
    this.input = new InputManager();
    this.camera = new FPSCamera();
    this.collision = new CollisionWorld();
    this.player = new PlayerController(this.camera, this.collision);
    this.weapon = new Weapon();
    this.effects = new Effects(this.scene);

    // Attach weapon to camera.
    this.camera.camera.add(this.weapon.group);

    // Build map.
    const { spawnA } = buildMap(this.scene, this.collision);
    this.scene.add(this.camera.camera);

    // Spawn player.
    this.player.spawn(spawnA.x, spawnA.y, spawnA.z);

    // Resize.
    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      this.camera.setAspect(rw, rh);
      this.renderer.setSize(rw, rh);
    };
    window.addEventListener("resize", onResize);

    // Pointer lock on click (document-level so overlays/HUD don't block it).
    const onClick = () => {
      if (!document.pointerLockElement) {
        this.input.requestPointerLock(container);
      }
    };
    document.addEventListener("click", onClick);
    this.onClick = onClick;

    // State update interval for React HUD.
    this.stateInterval = setInterval(() => {
      this.emitState();
    }, 50);

    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  private emitState() {
    const ws = this.weapon.getState();
    this.callbacks.onStateChange?.({
      health: this.player.health,
      ammo: ws.currentAmmo,
      reloading: ws.reloading,
      reloadProgress: ws.reloadProgress,
      crosshairVisible: this.input.pointerLocked,
    });
  }

  private loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // Cap at 50ms.
    this.lastTime = now;

    // FPS counter.
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Input.
    const input = this.input.poll();

    // Camera look.
    this.camera.handleInput(input);
    this.camera.updateAim(input.aim, dt);

    // Player movement.
    this.player.update(input, dt);

    // Weapon.
    const shot = this.weapon.update(input, dt, this.camera, this.collision, (point, normal) => {
      this.effects.bulletImpact(point, normal);
    }, () => {
      // Miss: nothing for now.
    });

    // Visible tracer + muzzle flash for every shot.
    if (shot) {
      this.effects.tracer(shot.origin, shot.point);
      this.effects.muzzleFlash(shot.origin);
    }

    // Effects.
    this.effects.update(dt);

    // Render.
    this.renderer.render(this.scene, this.camera.camera);
  }

  getFPS(): number {
    return this.fps;
  }

  dispose() {
    this.running = false;
    if (this.stateInterval) clearInterval(this.stateInterval);
    if (this.onClick) document.removeEventListener("click", this.onClick);
    this.effects.dispose();
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
