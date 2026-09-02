/**
 * Manages keyboard and mouse input state.
 * Reads from DOM events, stores state that the game loop polls.
 */

export interface InputState {
  keys: Set<string>;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  shoot: boolean;
  aim: boolean;
  reload: boolean;
  mouseX: number;
  mouseY: number;
  pointerLocked: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private _shoot = false;
  private _aim = false;
  private _mouseX = 0;
  private _mouseY = 0;
  private _pointerLocked = false;

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this._pointerLocked) {
      this._mouseX += e.movementX;
      this._mouseY += e.movementY;
    }
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this._shoot = true;
    if (e.button === 2) this._aim = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this._shoot = false;
    if (e.button === 2) this._aim = false;
  };
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };
  private onPointerLockChange = () => {
    this._pointerLocked = document.pointerLockElement !== null;
  };

  constructor() {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
  }

  requestPointerLock(element: HTMLElement) {
    element.requestPointerLock();
  }

  get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  poll(): InputState {
    const state: InputState = {
      keys: new Set(this.keys),
      forward: this.keys.has("KeyW"),
      backward: this.keys.has("KeyS"),
      left: this.keys.has("KeyA"),
      right: this.keys.has("KeyD"),
      jump: this.keys.has("Space"),
      shoot: this._shoot,
      aim: this._aim,
      reload: this.keys.has("KeyR"),
      mouseX: this._mouseX,
      mouseY: this._mouseY,
      pointerLocked: this._pointerLocked,
    };
    this._mouseX = 0;
    this._mouseY = 0;
    return state;
  }

  dispose() {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
  }
}
