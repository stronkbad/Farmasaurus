import { DIRECTION, type Direction } from '@shared/types';

export interface KeyState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}

export class KeyboardInput {
  #keys: KeyState = { w: false, a: false, s: false, d: false };
  #chatMode = false;

  constructor() {
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.#onKeyUp(e));
  }

  #onKeyDown(e: KeyboardEvent): void {
    if (this.#chatMode) return;
    switch (e.key.toLowerCase()) {
      case 'w': this.#keys.w = true; break;
      case 'a': this.#keys.a = true; break;
      case 's': this.#keys.s = true; break;
      case 'd': this.#keys.d = true; break;
    }
  }

  #onKeyUp(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case 'w': this.#keys.w = false; break;
      case 'a': this.#keys.a = false; break;
      case 's': this.#keys.s = false; break;
      case 'd': this.#keys.d = false; break;
    }
  }

  get keys(): KeyState {
    return { ...this.#keys };
  }

  /** Convert current WASD state to a tile-movement Direction (or null if idle). */
  getDirection(): Direction | null {
    const { w, a, s, d } = this.#keys;
    if (w && a) return DIRECTION.UP_LEFT;
    if (w && d) return DIRECTION.UP_RIGHT;
    if (s && a) return DIRECTION.DOWN_LEFT;
    if (s && d) return DIRECTION.DOWN_RIGHT;
    if (w) return DIRECTION.UP;
    if (s) return DIRECTION.DOWN;
    if (a) return DIRECTION.LEFT;
    if (d) return DIRECTION.RIGHT;
    return null;
  }

  get isMoving(): boolean {
    return this.#keys.w || this.#keys.a || this.#keys.s || this.#keys.d;
  }

  setChatMode(active: boolean): void {
    this.#chatMode = active;
    if (active) {
      this.#keys.w = false;
      this.#keys.a = false;
      this.#keys.s = false;
      this.#keys.d = false;
    }
  }
}
