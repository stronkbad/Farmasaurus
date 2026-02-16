export const DIRECTION = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP_LEFT: 'UP_LEFT',
  UP_RIGHT: 'UP_RIGHT',
  DOWN_LEFT: 'DOWN_LEFT',
  DOWN_RIGHT: 'DOWN_RIGHT',
} as const;

export type Direction = keyof typeof DIRECTION;

// Delta offsets for each direction (tile-space)
export const DIR_DX: Record<Direction, number> = {
  UP: 0, DOWN: 0, LEFT: -1, RIGHT: 1,
  UP_LEFT: -1, UP_RIGHT: 1, DOWN_LEFT: -1, DOWN_RIGHT: 1,
};
export const DIR_DY: Record<Direction, number> = {
  UP: -1, DOWN: 1, LEFT: 0, RIGHT: 0,
  UP_LEFT: -1, UP_RIGHT: -1, DOWN_LEFT: 1, DOWN_RIGHT: 1,
};

export interface TilePos { x: number; y: number; }

export interface EntityData {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  health: number;
  maxHealth: number;
}

export enum EntityType {
  PLAYER = 'PLAYER',
  SPIDER = 'SPIDER',
  SKELETON = 'SKELETON',
  ORC = 'ORC',
  NPC = 'NPC',
}
