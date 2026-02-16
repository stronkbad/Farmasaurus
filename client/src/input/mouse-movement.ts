import { DIRECTION_BY_OCTANT, type Direction } from '@shared/types';
import { RUN_DISTANCE_THRESHOLD } from '@shared/constants';

export interface MouseMovementState {
  direction: Direction | null;
  running: boolean;
}

const DEAD_ZONE = 5; // pixels — ignore cursor within this radius of character

export class MouseMovementInput {
  #canvas: HTMLCanvasElement | null = null;
  #rightButtonDown = false;
  #cursorScreenX = 0;
  #cursorScreenY = 0;
  #characterViewportX = 0;
  #characterViewportY = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.#rightButtonDown = true;
        this.#updateCursorPos(e);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.#rightButtonDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      this.#updateCursorPos(e);
    });

    canvas.addEventListener('mouseleave', () => {
      this.#rightButtonDown = false;
    });

    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  #updateCursorPos(e: MouseEvent): void {
    const rect = this.#canvas!.getBoundingClientRect();
    this.#cursorScreenX = e.clientX - rect.left;
    this.#cursorScreenY = e.clientY - rect.top;
  }

  /** Call each frame with the character's viewport-space position */
  updateCharacterScreenPos(viewportX: number, viewportY: number): void {
    this.#characterViewportX = viewportX;
    this.#characterViewportY = viewportY;
  }

  /** Get current movement direction and run/walk state from right-click hold */
  getMovement(): MouseMovementState {
    if (!this.#rightButtonDown) {
      return { direction: null, running: false };
    }

    const dx = this.#cursorScreenX - this.#characterViewportX;
    const dy = this.#cursorScreenY - this.#characterViewportY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < DEAD_ZONE) {
      return { direction: null, running: false };
    }

    // atan2(dy, dx): right=0, down=PI/2, left=±PI, up=-PI/2
    // Rotate so North (up, negative Y) = 0 by adding PI/2
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;

    // Divide into 8 octants of PI/4 each, offset by half-octant to center
    const octant = Math.floor(((angle + Math.PI / 8) % (Math.PI * 2)) / (Math.PI / 4));
    const direction = DIRECTION_BY_OCTANT[octant % 8];

    const running = distance > RUN_DISTANCE_THRESHOLD;

    return { direction, running };
  }

  get isActive(): boolean {
    return this.#rightButtonDown;
  }
}
