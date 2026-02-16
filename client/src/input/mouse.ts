import type { Camera } from '../rendering/camera';
import { screenToWorld } from '../rendering/isometric';

export interface ClickEvent {
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
  button: number;
}

export type ClickHandler = (event: ClickEvent) => void;

export class MouseInput {
  #camera: Camera;
  #handlers: ClickHandler[] = [];
  #canvas: HTMLCanvasElement | null = null;

  constructor(camera: Camera) {
    this.#camera = camera;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;
    canvas.addEventListener('mousedown', (e) => this.#onClick(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onClick(handler: ClickHandler): void {
    this.#handlers.push(handler);
  }

  #onClick(e: MouseEvent): void {
    const rect = this.#canvas!.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Undo camera offset to get world-space screen position
    const worldScreenPos = this.#camera.screenToWorld(screenX, screenY);

    // Convert isometric screen coords to tile-space world coords
    const world = screenToWorld(worldScreenPos.x, worldScreenPos.y);

    const event: ClickEvent = {
      worldX: world.worldX,
      worldY: world.worldY,
      screenX,
      screenY,
      button: e.button,
    };

    for (const handler of this.#handlers) {
      handler(event);
    }
  }
}
