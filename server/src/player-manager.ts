import { WebSocket } from 'ws';
import { type ClientInputMessage } from '../../shared/messages';
import type { PlayerState, ServerCombatMissMessage, ServerMoveAckMessage } from '../../shared/messages';
import { ServerMessageType } from '../../shared/messages';
import {
  PLAYER_WALK_MS, PLAYER_RUN_MS, PLAYER_MAX_HEALTH, PLAYER_ATTACK, PLAYER_DEFENSE,
  TICK_MS, WORLD_TILES_X, WORLD_TILES_Y, MELEE_RANGE, ATTACK_COOLDOWN_MS,
} from '../../shared/constants';
import { DIRECTION, DIR_DX, DIR_DY, type Direction } from '../../shared/types';

export interface ServerPlayer {
  id: string;
  ws: WebSocket;
  name: string;
  tileX: number; tileY: number;
  moveState: 'idle' | 'moving';
  fromX: number; fromY: number;
  moveTimer: number;
  moveDuration: number;
  queuedDirection: Direction | null;
  queuedRunning: boolean;
  queuedSeq: number;
  isRunning: boolean;
  direction: Direction;
  health: number; maxHealth: number;
  attack: number; defense: number;
  lastProcessedSeq: number;
  attackCooldown: number;
  targetId: string | null;
  isAttacking: boolean;
  isDead: boolean;
}

let nextPlayerId = 1;

export class PlayerManager {
  #players: Map<string, ServerPlayer> = new Map();
  #broadcast: ((data: string) => void) | null = null;

  setBroadcast(fn: (data: string) => void): void { this.#broadcast = fn; }

  addPlayer(ws: WebSocket, name: string): string {
    const id = `p${nextPlayerId++}`;
    const spawnX = Math.floor(WORLD_TILES_X / 2) + Math.floor((Math.random() - 0.5) * 6);
    const spawnY = Math.floor(WORLD_TILES_Y / 2) + Math.floor((Math.random() - 0.5) * 6);

    this.#players.set(id, {
      id, ws,
      name: name || `Player${id}`,
      tileX: spawnX, tileY: spawnY,
      moveState: 'idle',
      fromX: spawnX, fromY: spawnY,
      moveTimer: 0,
      moveDuration: PLAYER_WALK_MS,
      queuedDirection: null,
      queuedRunning: false,
      queuedSeq: 0,
      isRunning: false,
      direction: DIRECTION.DOWN,
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
      attack: PLAYER_ATTACK,
      defense: PLAYER_DEFENSE,
      lastProcessedSeq: 0,
      attackCooldown: 0,
      targetId: null,
      isAttacking: false,
      isDead: false,
    });
    return id;
  }

  removePlayer(id: string): void { this.#players.delete(id); }

  handleInput(playerId: string, input: ClientInputMessage): void {
    const player = this.#players.get(playerId);
    if (!player || player.isDead) return;

    // If overwriting an unconsumed non-null direction with null (player stopped
    // before the server processed the queued move), reject the old direction so
    // the client knows its prediction was wrong.
    if (player.queuedDirection !== null && input.direction === null) {
      this.#sendMoveAck(player, player.queuedSeq, false);
    }

    player.queuedDirection = input.direction;
    player.queuedRunning = input.running ?? false;
    player.queuedSeq = input.seq;
    player.lastProcessedSeq = input.seq;
  }

  handleAttack(playerId: string, targetId: string): void {
    const player = this.#players.get(playerId);
    if (player && !player.isDead) {
      player.targetId = targetId;
    }
  }

  processCombat(
    getEnemy: (id: string) => { tileX: number; tileY: number; health: number; maxHealth: number; defense?: number } | null,
    damageEnemy: (id: string, dmg: number, attackerId: string) => void,
  ): void {
    for (const player of this.#players.values()) {
      if (player.isDead || !player.targetId) {
        player.isAttacking = false;
        continue;
      }

      if (player.attackCooldown > 0) {
        player.attackCooldown -= TICK_MS;
        continue;
      }

      const target = getEnemy(player.targetId);
      if (!target || target.health <= 0) {
        player.targetId = null;
        player.isAttacking = false;
        continue;
      }

      const dist = Math.max(
        Math.abs(target.tileX - player.tileX),
        Math.abs(target.tileY - player.tileY),
      );
      if (dist > MELEE_RANGE) {
        player.isAttacking = false;
        continue;
      }

      const dx = Math.sign(target.tileX - player.tileX);
      const dy = Math.sign(target.tileY - player.tileY);
      if (dx !== 0 || dy !== 0) setDirection(player, dx, dy);

      player.isAttacking = true;
      player.attackCooldown = ATTACK_COOLDOWN_MS;

      if (Math.random() < 0.2) {
        if (this.#broadcast) {
          const miss: ServerCombatMissMessage = {
            type: ServerMessageType.COMBAT_MISS,
            targetId: player.targetId,
            attackerId: player.id,
          };
          this.#broadcast(JSON.stringify(miss));
        }
        continue;
      }

      const baseDmg = player.attack + Math.floor(Math.random() * 4) - 1;
      const dmg = Math.max(1, baseDmg - (target.defense ?? 0));
      damageEnemy(player.targetId, dmg, player.id);
    }
  }

  /** Try to start a move in the given direction. Returns true if the move started. */
  #tryMove(player: ServerPlayer, dir: Direction, isTileWalkable: (x: number, y: number, fromX?: number, fromY?: number) => boolean): boolean {
    let dx = DIR_DX[dir];
    let dy = DIR_DY[dir];
    if (dx === 0 && dy === 0) return false;

    setDirection(player, dx, dy);

    // Try full diagonal first, then fall back to cardinal components
    let canMove = false;
    if (dx !== 0 && dy !== 0) {
      const perpOk = isTileWalkable(player.tileX + dx, player.tileY, player.tileX, player.tileY) &&
                      isTileWalkable(player.tileX, player.tileY + dy, player.tileX, player.tileY);
      if (perpOk && isTileWalkable(player.tileX + dx, player.tileY + dy, player.tileX, player.tileY)) {
        canMove = true;
      } else if (isTileWalkable(player.tileX + dx, player.tileY, player.tileX, player.tileY)) {
        dy = 0; canMove = true;
      } else if (isTileWalkable(player.tileX, player.tileY + dy, player.tileX, player.tileY)) {
        dx = 0; canMove = true;
      }
    } else {
      canMove = isTileWalkable(player.tileX + dx, player.tileY + dy, player.tileX, player.tileY);
    }

    if (!canMove) return false;

    player.fromX = player.tileX;
    player.fromY = player.tileY;
    player.tileX = player.tileX + dx;
    player.tileY = player.tileY + dy;
    player.moveState = 'moving';
    player.moveTimer = 0;
    player.isRunning = player.queuedRunning;
    player.moveDuration = player.isRunning ? PLAYER_RUN_MS : PLAYER_WALK_MS;
    return true;
  }

  updateAll(isTileWalkable: (x: number, y: number, fromX?: number, fromY?: number) => boolean): void {
    for (const player of this.#players.values()) {
      if (player.isDead) continue;

      if (player.moveState === 'moving') {
        player.moveTimer += TICK_MS;
        if (player.moveTimer >= player.moveDuration) {
          // Move complete — chain into next move if a NEW intent arrived
          const excess = player.moveTimer - player.moveDuration;
          const dir = player.queuedDirection;
          if (dir) {
            const seq = player.queuedSeq;
            player.queuedDirection = null; // consume — prevents stale reuse
            const accepted = this.#tryMove(player, dir, isTileWalkable);
            if (accepted) {
              player.moveTimer = excess;
            } else {
              player.moveState = 'idle';
              player.moveTimer = 0;
            }
            this.#sendMoveAck(player, seq, accepted);
          } else {
            player.moveState = 'idle';
            player.moveTimer = 0;
          }
        }
        continue;
      }

      // Idle — try to start a new move
      const dir = player.queuedDirection;
      if (dir) {
        const seq = player.queuedSeq;
        player.queuedDirection = null; // consume — one intent per step
        const accepted = this.#tryMove(player, dir, isTileWalkable);
        this.#sendMoveAck(player, seq, accepted);
      }
    }
  }

  #sendMoveAck(player: ServerPlayer, seq: number, accepted: boolean): void {
    if (player.ws.readyState === WebSocket.OPEN) {
      const msg: ServerMoveAckMessage = {
        type: ServerMessageType.MOVE_ACK,
        seq,
        tileX: player.tileX,
        tileY: player.tileY,
        accepted,
      };
      player.ws.send(JSON.stringify(msg));
    }
  }

  getPlayerState(id: string): PlayerState | null {
    const p = this.#players.get(id);
    if (!p) return null;
    let anim = 'IDLE';
    if (p.isDead) anim = 'DEAD';
    else if (p.isAttacking) anim = 'ATTACK';
    else if (p.moveState === 'moving') anim = 'WALK';
    const progress = p.moveState === 'moving' ? Math.min(p.moveTimer / p.moveDuration, 1) : 1;
    return {
      id: p.id, name: p.name,
      x: p.tileX, y: p.tileY,
      fromX: p.fromX, fromY: p.fromY,
      moveProgress: progress,
      direction: p.direction, animation: anim,
      health: p.health, maxHealth: p.maxHealth,
      isMoving: p.moveState === 'moving',
      isRunning: p.isRunning,
      isAttacking: p.isAttacking,
      targetId: p.targetId,
    };
  }

  getAllPlayerStates(): PlayerState[] {
    return [...this.#players.values()].map(p => this.getPlayerState(p.id)!);
  }

  getPlayersPositions(): { id: string; x: number; y: number }[] {
    return [...this.#players.values()]
      .filter(p => !p.isDead)
      .map(p => ({ id: p.id, x: p.tileX, y: p.tileY }));
  }

  getPlayerTiles(): { x: number; y: number }[] {
    return [...this.#players.values()]
      .filter(p => !p.isDead)
      .map(p => ({ x: p.tileX, y: p.tileY }));
  }

  entries(): IterableIterator<[string, ServerPlayer]> {
    return this.#players.entries();
  }
}

function setDirection(entity: { direction: Direction }, dx: number, dy: number): void {
  if (dx > 0 && dy < 0) entity.direction = DIRECTION.UP_RIGHT;
  else if (dx < 0 && dy < 0) entity.direction = DIRECTION.UP_LEFT;
  else if (dx > 0 && dy > 0) entity.direction = DIRECTION.DOWN_RIGHT;
  else if (dx < 0 && dy > 0) entity.direction = DIRECTION.DOWN_LEFT;
  else if (dx > 0) entity.direction = DIRECTION.RIGHT;
  else if (dx < 0) entity.direction = DIRECTION.LEFT;
  else if (dy < 0) entity.direction = DIRECTION.UP;
  else if (dy > 0) entity.direction = DIRECTION.DOWN;
}
