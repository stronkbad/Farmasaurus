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
