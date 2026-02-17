import { DIRECTION_BY_OCTANT, type Direction } from '@shared/types';
import { RUN_DISTANCE_THRESHOLD } from '@shared/constants';

export interface MouseMovementState {
  direction: Direction | null;
  running: boolean;
}

const DEAD_ZONE = 5; // pixels — ignore cursor within this radius of character
const OCTANT_SIZE = Math.PI / 4; // 45 degrees per octant
const HYSTERESIS = OCTANT_SIZE * 0.3; // must move 30% past boundary to change direction

export class MouseMovementInput {
  #canvas: HTMLCanvasElement | null = null;
  #rightButtonDown = false;
  #cursorScreenX = 0;
  #cursorScreenY = 0;
  #characterViewportX = 0;
  #characterViewportY = 0;

  // Stateful octant — "Octants allowed but stateful. Hysteresis required."
  #lastOctant = -1;
  #lastAngle = 0;

  // Pending click — survives even if button is released before next frame
  #hasPendingClick = false;
  #pendingClickScreenX = 0;
  #pendingClickScreenY = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.#canvas = canvas;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.#rightButtonDown = true;
        this.#lastOctant = -1; // reset hysteresis on new click
        this.#updateCursorPos(e);
        // Record the click so it's never lost between frames
        this.#hasPendingClick = true;
        this.#pendingClickScreenX = this.#cursorScreenX;
        this.#pendingClickScreenY = this.#cursorScreenY;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.#rightButtonDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      this.#updateCursorPos(e);
    });

    // Don't clear rightButtonDown on mouseleave — only clear on mouseup.
    // Per architecture: "On release: stop queueing steps." Mouseleave is not a release.

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

  /** Get current movement direction and run/walk state from right-click hold.
   *  Direction is stateful with hysteresis — won't flicker at octant boundaries. */
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

    let octant: number;
    if (this.#lastOctant < 0) {
      // First sample — compute raw octant
      octant = Math.floor(((angle + OCTANT_SIZE / 2) % (Math.PI * 2)) / OCTANT_SIZE);
    } else {
      // Hysteresis: keep current octant unless angle moved past boundary + hysteresis band.
      // Compute angular distance from the center of the current octant.
      const currentCenter = this.#lastOctant * OCTANT_SIZE;
      let diff = angle - currentCenter;
      // Normalize to [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      if (Math.abs(diff) > OCTANT_SIZE / 2 + HYSTERESIS) {
        // Moved far enough — recompute octant from raw angle
        octant = Math.floor(((angle + OCTANT_SIZE / 2) % (Math.PI * 2)) / OCTANT_SIZE);
      } else {
        octant = this.#lastOctant;
      }
    }

    this.#lastOctant = octant % 8;
    this.#lastAngle = angle;
    const direction = DIRECTION_BY_OCTANT[octant % 8];
    const running = distance > RUN_DISTANCE_THRESHOLD;

    return { direction, running };
  }

  get isActive(): boolean {
    return this.#rightButtonDown;
  }

  get cursorScreenX(): number { return this.#cursorScreenX; }
  get cursorScreenY(): number { return this.#cursorScreenY; }

  /** True if a right-click happened that hasn't been consumed yet */
  get hasPendingClick(): boolean { return this.#hasPendingClick; }
  get pendingClickScreenX(): number { return this.#pendingClickScreenX; }
  get pendingClickScreenY(): number { return this.#pendingClickScreenY; }

  /** Mark the pending click as handled */
  consumeClick(): void { this.#hasPendingClick = false; }
}
