import { TILE_WIDTH, TILE_HEIGHT } from '@shared/constants';

/**
 * Standard 2:1 isometric projection.
 * All world positions are in tile-space (1 unit = 1 tile).
 * Screen positions are in pixels.
 */

/** Convert tile-space world coordinates to isometric screen pixels. */
export function worldToScreen(wx: number, wy: number): { screenX: number; screenY: number } {
  return {
    screenX: (wx - wy) * (TILE_WIDTH / 2),
    screenY: (wx + wy) * (TILE_HEIGHT / 2),
  };
}

/** Convert isometric screen pixels back to tile-space world coordinates. */
export function screenToWorld(sx: number, sy: number): { worldX: number; worldY: number } {
  return {
    worldX: (sx / (TILE_WIDTH / 2) + sy / (TILE_HEIGHT / 2)) / 2,
    worldY: (sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2,
  };
}

/** Convert integer tile grid position to screen pixels (same as worldToScreen). */
export function tileToScreen(tileX: number, tileY: number): { screenX: number; screenY: number } {
  return worldToScreen(tileX, tileY);
}

/** Convert screen pixels to the nearest tile grid position. */
export function screenToTile(sx: number, sy: number): { tileX: number; tileY: number } {
  const w = screenToWorld(sx, sy);
  return {
    tileX: Math.floor(w.worldX),
    tileY: Math.floor(w.worldY),
  };
}
