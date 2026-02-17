// World - all positions are integer tile coordinates
export const TILE_WIDTH = 44;  // screen pixels wide per diamond (UO standard)
export const TILE_HEIGHT = 22; // screen pixels tall per diamond (2:1 ratio)
export const WORLD_TILES_X = 8000;
export const WORLD_TILES_Y = 8000;

// Server
export const SERVER_PORT = 3001;
export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

// Player - tile-based movement (milliseconds per tile)
export const PLAYER_WALK_MS = 500;  // 2.0 tiles/sec (30 frames/tile at 60fps)
export const PLAYER_RUN_MS = 250;   // 4.0 tiles/sec (15 frames/tile at 60fps)
export const PLAYER_MAX_HEALTH = 50;
export const PLAYER_MAX_MANA = 30;
export const PLAYER_MAX_STAMINA = 40;
export const PLAYER_ATTACK = 8;
export const PLAYER_DEFENSE = 3;

// Mouse movement
export const RUN_DISTANCE_THRESHOLD = 100; // screen px from character; beyond = run

// Enemies - tile-based movement (milliseconds per tile)
export const ENEMY_SPIDER_MOVE_MS = 850;
export const ENEMY_SPIDER_HEALTH = 20;
export const ENEMY_SPIDER_ATTACK = 4;
export const ENEMY_SPIDER_AGGRO_RANGE = 6;  // tiles

export const ENEMY_SKELETON_MOVE_MS = 1100;
export const ENEMY_SKELETON_HEALTH = 35;
export const ENEMY_SKELETON_ATTACK = 7;
export const ENEMY_SKELETON_AGGRO_RANGE = 7;

export const ENEMY_ORC_MOVE_MS = 750;
export const ENEMY_ORC_HEALTH = 45;
export const ENEMY_ORC_ATTACK = 10;
export const ENEMY_ORC_AGGRO_RANGE = 8;

// Combat
export const MELEE_RANGE = 1;  // adjacent tile (Chebyshev distance)
export const ATTACK_COOLDOWN_MS = 1200;
export const HIT_FLASH_MS = 150;

// AI
export const ENEMY_WANDER_INTERVAL_MS = 2000;
export const ENEMY_LEASH_RANGE = 12;  // tiles from spawn before returning
export const ENEMY_RESPAWN_MS = 10000;
