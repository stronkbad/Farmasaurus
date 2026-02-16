import { Container } from 'pixi.js';

export class Camera {
  #worldContainer: Container;
  #screenWidth: number;
  #screenHeight: number;
  #targetX = 0;
  #targetY = 0;
  #lerp = 0.18;
  #zoom = 2;

  constructor(worldContainer: Container, screenWidth: number, screenHeight: number) {
    this.#worldContainer = worldContainer;
    this.#screenWidth = screenWidth;
    this.#screenHeight = screenHeight;
    this.#worldContainer.scale.set(this.#zoom);
  }

  get zoom(): number { return this.#zoom; }

  set zoom(value: number) {
    this.#zoom = Math.max(0.5, Math.min(4, value));
    this.#worldContainer.scale.set(this.#zoom);
  }

  setTarget(screenX: number, screenY: number): void {
    this.#targetX = screenX;
    this.#targetY = screenY;
  }

  resize(width: number, height: number): void {
    this.#screenWidth = width;
    this.#screenHeight = height;
  }

  update(): void {
    const desiredX = this.#screenWidth / 2 - this.#targetX * this.#zoom;
    const desiredY = this.#screenHeight / 2 - this.#targetY * this.#zoom;

    this.#worldContainer.x += (desiredX - this.#worldContainer.x) * this.#lerp;
    this.#worldContainer.y += (desiredY - this.#worldContainer.y) * this.#lerp;
  }

  snapTo(screenX: number, screenY: number): void {
    this.#targetX = screenX;
    this.#targetY = screenY;
    this.#worldContainer.x = this.#screenWidth / 2 - screenX * this.#zoom;
    this.#worldContainer.y = this.#screenHeight / 2 - screenY * this.#zoom;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.#worldContainer.x) / this.#zoom,
      y: (screenY - this.#worldContainer.y) / this.#zoom,
    };
  }
}
