import { WORLD_TILES_X, WORLD_TILES_Y } from './constants';

// Deterministic seeded random — same seed always gives same terrain
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function smoothNoise(x: number, y: number, seed: number): number {
  const rng = seededRandom(Math.floor(x * 374761 + y * 668265 + seed));
  return rng();
}

function fbmNoise(x: number, y: number, seed: number, octaves = 3): number {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    const ix = Math.floor(x * freq), iy = Math.floor(y * freq);
    const fx = (x * freq) - ix, fy = (y * freq) - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = smoothNoise(ix, iy, seed + i * 100);
    const b = smoothNoise(ix + 1, iy, seed + i * 100);
    const c = smoothNoise(ix, iy + 1, seed + i * 100);
    const d = smoothNoise(ix + 1, iy + 1, seed + i * 100);
    val += (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * amp;
    max += amp; amp *= 0.5; freq *= 2;
  }
  return val / max;
}

export enum TileType {
  DEEP_WATER = 0,
  SHALLOW_WATER = 1,
  SAND = 2,
  GRASS_LIGHT = 3,
  GRASS = 4,
  GRASS_DARK = 5,
  DIRT = 6,
  ROCK = 7,
  FOREST = 8,
}

export const TERRAIN_SEED = 42;

export function getTileType(x: number, y: number): TileType {
  const elevation = fbmNoise(x * 0.08, y * 0.08, TERRAIN_SEED, 4);
  const moisture = fbmNoise(x * 0.06 + 50, y * 0.06 + 50, TERRAIN_SEED + 500, 3);

  const edgeDist = Math.min(x, y, WORLD_TILES_X - 1 - x, WORLD_TILES_Y - 1 - y);
  const edgeFade = Math.min(edgeDist / 4, 1);
  const e = elevation * edgeFade;

  if (e < 0.2) return TileType.DEEP_WATER;
  if (e < 0.3) return TileType.SHALLOW_WATER;
  if (e < 0.35) return TileType.SAND;
  if (e < 0.55) {
    if (moisture > 0.6) return TileType.GRASS_DARK;
    if (moisture > 0.4) return TileType.GRASS;
    return TileType.GRASS_LIGHT;
  }
  if (e < 0.7) return moisture > 0.5 ? TileType.FOREST : TileType.DIRT;
  return TileType.ROCK;
}

/** Returns true if this tile type allows walking */
export function isTerrainWalkable(x: number, y: number): boolean {
  const type = getTileType(x, y);
  return type !== TileType.DEEP_WATER && type !== TileType.SHALLOW_WATER;
}

// ===== Elevation System =====

/** Screen pixels of vertical offset per Z unit */
export const Z_PIXEL_HEIGHT = 4;

/** Maximum Z difference between adjacent tiles that allows walking */
export const STEP_HEIGHT = 4;

/**
 * Returns integer elevation Z (0–15) for a tile.
 * Uses a continuous mapping from the raw terrain noise to avoid
 * discontinuous jumps at biome boundaries.
 */
export function getTileElevation(x: number, y: number): number {
  const type = getTileType(x, y);

  // Water is always sea level
  if (type === TileType.DEEP_WATER || type === TileType.SHALLOW_WATER) return 0;

  // Use the same noise as biome selection for a continuous elevation curve
  const edgeDist = Math.min(x, y, WORLD_TILES_X - 1 - x, WORLD_TILES_Y - 1 - y);
  const edgeFade = Math.min(edgeDist / 4, 1);
  const e = fbmNoise(x * 0.08, y * 0.08, TERRAIN_SEED, 4) * edgeFade;

  // Continuous mapping: sand/grass border (e≈0.3) → Z=1, rock peaks (e≈1.0) → Z=15
  // This avoids biome-boundary cliffs because Z depends only on the smooth noise value
  const z = Math.round(1 + (e - 0.28) * 12);
  return Math.max(1, Math.min(15, z));
}

/**
 * Returns corner heights for a tile's 4 diamond vertices.
 * Each corner is the average of the 4 tiles sharing that vertex.
 * Order: [north (top), east (right), south (bottom), west (left)]
 */
export function getTileCornerHeights(x: number, y: number): [number, number, number, number] {
  const c  = getTileElevation(x, y);
  const n  = getTileElevation(x, y - 1);
  const s  = getTileElevation(x, y + 1);
  const e  = getTileElevation(x + 1, y);
  const w  = getTileElevation(x - 1, y);
  const ne = getTileElevation(x + 1, y - 1);
  const nw = getTileElevation(x - 1, y - 1);
  const se = getTileElevation(x + 1, y + 1);
  const sw = getTileElevation(x - 1, y + 1);

  return [
    (c + n + nw + w) / 4,  // north (top vertex)
    (c + n + ne + e) / 4,  // east (right vertex)
    (c + s + se + e) / 4,  // south (bottom vertex)
    (c + s + sw + w) / 4,  // west (left vertex)
  ];
}

/** Returns true if movement between two tiles is valid considering elevation */
export function isElevationWalkable(fromX: number, fromY: number, toX: number, toY: number): boolean {
  return Math.abs(getTileElevation(fromX, fromY) - getTileElevation(toX, toY)) <= STEP_HEIGHT;
}
