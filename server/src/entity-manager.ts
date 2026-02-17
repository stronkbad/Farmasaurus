import type { EnemyState, ServerDamageMessage, ServerEntityDeathMessage } from '../../shared/messages';
import { ServerMessageType } from '../../shared/messages';
import {
  ENEMY_SPIDER_MOVE_MS, ENEMY_SPIDER_HEALTH, ENEMY_SPIDER_ATTACK, ENEMY_SPIDER_AGGRO_RANGE,
  ENEMY_SKELETON_MOVE_MS, ENEMY_SKELETON_HEALTH, ENEMY_SKELETON_ATTACK, ENEMY_SKELETON_AGGRO_RANGE,
  ENEMY_ORC_MOVE_MS, ENEMY_ORC_HEALTH, ENEMY_ORC_ATTACK, ENEMY_ORC_AGGRO_RANGE,
  TICK_MS, WORLD_TILES_X, WORLD_TILES_Y,
  ENEMY_WANDER_INTERVAL_MS, ENEMY_LEASH_RANGE, ENEMY_RESPAWN_MS,
} from '../../shared/constants';
import { DIRECTION, DIR_DX, DIR_DY, type Direction, EntityType } from '../../shared/types';
import { isTerrainWalkable, isElevationWalkable } from '../../shared/terrain';

interface ServerEnemy {
  id: string;
  type: EntityType;
  tileX: number; tileY: number;
  spawnX: number; spawnY: number;
  moveState: 'idle' | 'moving';
  fromX: number; fromY: number;
  moveTimer: number;
  moveDuration: number;
  direction: Direction;
  health: number; maxHealth: number;
  attack: number; defense: number;
  aggroRange: number;
  aiState: 'wander' | 'chase' | 'idle' | 'return';
  aiTimer: number;
  targetPlayerId: string | null;
  attackCooldown: number;
}

let nextEnemyId = 1;

const ENEMY_CONFIGS: Record<string, {
  moveMs: number; health: number; attack: number; defense: number; aggroRange: number;
}> = {
  [EntityType.SPIDER]:   { moveMs: ENEMY_SPIDER_MOVE_MS, health: ENEMY_SPIDER_HEALTH, attack: ENEMY_SPIDER_ATTACK, defense: 1, aggroRange: ENEMY_SPIDER_AGGRO_RANGE },
  [EntityType.SKELETON]: { moveMs: ENEMY_SKELETON_MOVE_MS, health: ENEMY_SKELETON_HEALTH, attack: ENEMY_SKELETON_ATTACK, defense: 4, aggroRange: ENEMY_SKELETON_AGGRO_RANGE },
  [EntityType.ORC]:      { moveMs: ENEMY_ORC_MOVE_MS, health: ENEMY_ORC_HEALTH, attack: ENEMY_ORC_ATTACK, defense: 5, aggroRange: ENEMY_ORC_AGGRO_RANGE },
};

function tileKey(x: number, y: number): string { return `${x},${y}`; }

export class EntityManager {
  #enemies: Map<string, ServerEnemy> = new Map();
  #broadcast: ((data: string) => void) | null = null;
  #occupied: Set<string> = new Set();

  setBroadcast(fn: (data: string) => void): void { this.#broadcast = fn; }

  buildOccupancy(playerTiles: { x: number; y: number }[]): void {
    this.#occupied.clear();
    for (const e of this.#enemies.values()) {
      if (e.health <= 0) continue;
      this.#occupied.add(tileKey(e.tileX, e.tileY));
    }
    for (const p of playerTiles) {
      this.#occupied.add(tileKey(p.x, p.y));
    }
  }

  isTileOccupied(x: number, y: number): boolean {
    return this.#occupied.has(tileKey(x, y));
  }

  isTileWalkable(x: number, y: number, fromX?: number, fromY?: number): boolean {
    if (x < 1 || y < 1 || x >= WORLD_TILES_X - 1 || y >= WORLD_TILES_Y - 1) return false;
    if (this.#occupied.has(tileKey(x, y))) return false;
    if (!isTerrainWalkable(x, y)) return false;
    if (fromX !== undefined && fromY !== undefined) {
      if (!isElevationWalkable(fromX, fromY, x, y)) return false;
    }
    return true;
  }

  spawnInitialEnemies(): void {
    const cx = Math.floor(WORLD_TILES_X / 2);
    const cy = Math.floor(WORLD_TILES_Y / 2);
    const placed = new Set<string>();

    const trySpawn = (type: EntityType, baseX: number, baseY: number, spread: number) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = baseX + Math.floor((Math.random() - 0.5) * spread);
        const y = baseY + Math.floor((Math.random() - 0.5) * spread);
        const key = tileKey(x, y);
        if (!placed.has(key) && x >= 2 && y >= 2 && x < WORLD_TILES_X - 2 && y < WORLD_TILES_Y - 2 && isTerrainWalkable(x, y)) {
          placed.add(key);
          this.#spawnEnemy(type, x, y);
          return;
        }
      }
    };

    // Scatter enemy clusters across the world — explore to find them
    // Spiders: common, near spawn and spread out
    for (let i = 0; i < 3; i++) trySpawn(EntityType.SPIDER, cx, cy, 30);
    for (let i = 0; i < 2; i++) trySpawn(EntityType.SPIDER, cx + 40, cy - 30, 20);
    for (let i = 0; i < 2; i++) trySpawn(EntityType.SPIDER, cx - 50, cy + 40, 20);

    // Skeletons: further from spawn
    for (let i = 0; i < 2; i++) trySpawn(EntityType.SKELETON, cx + 60, cy + 20, 16);
    for (let i = 0; i < 2; i++) trySpawn(EntityType.SKELETON, cx - 30, cy - 60, 16);

    // Orcs: dangerous, far from spawn
    for (let i = 0; i < 2; i++) trySpawn(EntityType.ORC, cx + 80, cy - 50, 12);
    for (let i = 0; i < 2; i++) trySpawn(EntityType.ORC, cx - 70, cy + 70, 12);
  }

  #spawnEnemy(type: EntityType, x: number, y: number): void {
    const id = `e${nextEnemyId++}`;
    const cfg = ENEMY_CONFIGS[type];
    this.#enemies.set(id, {
      id, type,
      tileX: x, tileY: y,
      spawnX: x, spawnY: y,
      moveState: 'idle',
      fromX: x, fromY: y,
      moveTimer: 0,
      moveDuration: cfg.moveMs,
      direction: DIRECTION.DOWN,
      health: cfg.health, maxHealth: cfg.health,
      attack: cfg.attack, defense: cfg.defense,
      aggroRange: cfg.aggroRange,
      aiState: 'wander',
      aiTimer: Math.random() * ENEMY_WANDER_INTERVAL_MS,
      targetPlayerId: null,
      attackCooldown: 0,
    });
  }

  getEnemy(id: string): ServerEnemy | null { return this.#enemies.get(id) ?? null; }

  damageEnemy(id: string, dmg: number, attackerId: string): void {
    const e = this.#enemies.get(id);
    if (!e || e.health <= 0) return;
    e.health = Math.max(0, e.health - dmg);
    if (this.#broadcast) {
      this.#broadcast(JSON.stringify({
        type: ServerMessageType.DAMAGE, targetId: id, damage: dmg,
        attackerId, targetHealth: e.health,
      } as ServerDamageMessage));
    }
    if (e.health <= 0) {
      if (this.#broadcast) {
        this.#broadcast(JSON.stringify({
          type: ServerMessageType.ENTITY_DEATH, entityId: id,
          killerId: attackerId, entityType: e.type,
        } as ServerEntityDeathMessage));
      }
      setTimeout(() => {
        if (this.#enemies.has(id)) {
          e.health = e.maxHealth;
          let rx = e.spawnX, ry = e.spawnY;
          for (let attempt = 0; attempt < 20; attempt++) {
            const nx = e.spawnX + Math.floor((Math.random() - 0.5) * 6);
            const ny = e.spawnY + Math.floor((Math.random() - 0.5) * 6);
            if (!this.#occupied.has(tileKey(nx, ny))) { rx = nx; ry = ny; break; }
          }
          e.tileX = rx; e.tileY = ry;
          e.fromX = rx; e.fromY = ry;
          e.moveState = 'idle';
          e.aiState = 'wander';
          e.targetPlayerId = null;
        }
      }, ENEMY_RESPAWN_MS);
    }
  }

  /** Run AI logic for an idle enemy: chase, return, or wander. */
  #runAI(enemy: ServerEnemy, playerPositions: { id: string; x: number; y: number }[]): void {
    enemy.aiTimer -= TICK_MS;
    if (enemy.attackCooldown > 0) enemy.attackCooldown -= TICK_MS;

    let closest: { id: string; x: number; y: number; dist: number } | null = null;
    for (const p of playerPositions) {
      const dist = Math.max(Math.abs(p.x - enemy.tileX), Math.abs(p.y - enemy.tileY));
      if (dist <= enemy.aggroRange && (!closest || dist < closest.dist)) {
        closest = { ...p, dist };
      }
    }

    if (closest) {
      enemy.aiState = 'chase';
      enemy.targetPlayerId = closest.id;
      if (closest.dist <= 1) {
        this.#faceToward(enemy, closest.x, closest.y);
      } else {
        this.#stepToward(enemy, closest.x, closest.y);
      }
    } else {
      const distToSpawn = Math.max(Math.abs(enemy.tileX - enemy.spawnX), Math.abs(enemy.tileY - enemy.spawnY));
      if (distToSpawn > ENEMY_LEASH_RANGE) {
        enemy.aiState = 'return';
        enemy.targetPlayerId = null;
        this.#stepToward(enemy, enemy.spawnX, enemy.spawnY);
      } else {
        enemy.aiState = 'wander';
        enemy.targetPlayerId = null;
        if (enemy.aiTimer <= 0) {
          enemy.aiTimer = ENEMY_WANDER_INTERVAL_MS + Math.random() * 1000;
          this.#stepRandom(enemy);
        }
      }
    }
  }

  updateAll(playerPositions: { id: string; x: number; y: number }[]): void {
    for (const enemy of this.#enemies.values()) {
      if (enemy.health <= 0) continue;

      if (enemy.moveState === 'moving') {
        enemy.moveTimer += TICK_MS;
        if (enemy.moveTimer >= enemy.moveDuration) {
          // Move complete — chain into next move immediately (no idle gap)
          const excess = enemy.moveTimer - enemy.moveDuration;
          enemy.moveState = 'idle';
          enemy.moveTimer = 0;
          this.#runAI(enemy, playerPositions);
          // #runAI may start a new move via #tryMove (TS can't track mutation through method calls)
          if ((enemy.moveState as string) === 'moving') {
            enemy.moveTimer = excess;
          }
        }
        continue;
      }

      this.#runAI(enemy, playerPositions);
    }
  }

  #stepToward(enemy: ServerEnemy, targetX: number, targetY: number): void {
    const dx = Math.sign(targetX - enemy.tileX);
    const dy = Math.sign(targetY - enemy.tileY);
    if (this.#tryMove(enemy, dx, dy)) return;
    if (dx !== 0 && this.#tryMove(enemy, dx, 0)) return;
    if (dy !== 0 && this.#tryMove(enemy, 0, dy)) return;
  }

  #stepRandom(enemy: ServerEnemy): void {
    const dirs: Direction[] = [DIRECTION.UP, DIRECTION.DOWN, DIRECTION.LEFT, DIRECTION.RIGHT,
      DIRECTION.UP_LEFT, DIRECTION.UP_RIGHT, DIRECTION.DOWN_LEFT, DIRECTION.DOWN_RIGHT];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const dir of dirs) {
      if (this.#tryMove(enemy, DIR_DX[dir], DIR_DY[dir])) return;
    }
  }

  #tryMove(enemy: ServerEnemy, dx: number, dy: number): boolean {
    if (dx === 0 && dy === 0) return false;
    const nx = enemy.tileX + dx;
    const ny = enemy.tileY + dy;
    // Diagonal validation: both perpendicular cardinal dirs must be passable
    if (dx !== 0 && dy !== 0) {
      if (!this.isTileWalkable(enemy.tileX + dx, enemy.tileY, enemy.tileX, enemy.tileY) ||
          !this.isTileWalkable(enemy.tileX, enemy.tileY + dy, enemy.tileX, enemy.tileY)) {
        return false;
      }
    }
    if (!this.isTileWalkable(nx, ny, enemy.tileX, enemy.tileY)) return false;

    enemy.fromX = enemy.tileX;
    enemy.fromY = enemy.tileY;
    enemy.tileX = nx;
    enemy.tileY = ny;
    enemy.moveState = 'moving';
    enemy.moveTimer = 0;

    this.#occupied.delete(tileKey(enemy.fromX, enemy.fromY));
    this.#occupied.add(tileKey(nx, ny));

    this.#setDirection(enemy, dx, dy);
    return true;
  }

  #faceToward(enemy: ServerEnemy, tx: number, ty: number): void {
    const dx = Math.sign(tx - enemy.tileX);
    const dy = Math.sign(ty - enemy.tileY);
    this.#setDirection(enemy, dx, dy);
  }

  #setDirection(enemy: ServerEnemy, dx: number, dy: number): void {
    if (dx > 0 && dy < 0) enemy.direction = DIRECTION.UP_RIGHT;
    else if (dx < 0 && dy < 0) enemy.direction = DIRECTION.UP_LEFT;
    else if (dx > 0 && dy > 0) enemy.direction = DIRECTION.DOWN_RIGHT;
    else if (dx < 0 && dy > 0) enemy.direction = DIRECTION.DOWN_LEFT;
    else if (dx > 0) enemy.direction = DIRECTION.RIGHT;
    else if (dx < 0) enemy.direction = DIRECTION.LEFT;
    else if (dy < 0) enemy.direction = DIRECTION.UP;
    else if (dy > 0) enemy.direction = DIRECTION.DOWN;
  }

  getAllEnemyStates(): EnemyState[] {
    const states: EnemyState[] = [];
    for (const e of this.#enemies.values()) {
      if (e.health <= 0) continue;
      const progress = e.moveState === 'moving' ? Math.min(e.moveTimer / e.moveDuration, 1) : 1;
      states.push({
        id: e.id, enemyType: e.type,
        x: e.tileX, y: e.tileY,
        fromX: e.fromX, fromY: e.fromY,
        moveProgress: progress,
        direction: e.direction,
        animation: e.moveState === 'moving' ? 'WALK' : 'IDLE',
        health: e.health, maxHealth: e.maxHealth,
        isMoving: e.moveState === 'moving',
      });
    }
    return states;
  }
}
