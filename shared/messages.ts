import type { Direction } from './types';

// Client → Server
export enum ClientMessageType {
  JOIN = 'JOIN',
  INPUT = 'INPUT',
  CHAT = 'CHAT',
  INTERACT = 'INTERACT',
  ATTACK = 'ATTACK',
}

export interface ClientJoinMessage { type: ClientMessageType.JOIN; name: string; }
// direction = which way to move this tick (null = stay still)
export interface ClientInputMessage { type: ClientMessageType.INPUT; direction: Direction | null; seq: number; running: boolean; }
export interface ClientChatMessage { type: ClientMessageType.CHAT; text: string; }
export interface ClientInteractMessage { type: ClientMessageType.INTERACT; targetId: string; }
export interface ClientAttackMessage { type: ClientMessageType.ATTACK; targetId: string; }

export type ClientMessage = ClientJoinMessage | ClientInputMessage | ClientChatMessage | ClientInteractMessage | ClientAttackMessage;

// Server → Client
export enum ServerMessageType {
  WELCOME = 'WELCOME',
  STATE_UPDATE = 'STATE_UPDATE',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  CHAT = 'CHAT',
  DAMAGE = 'DAMAGE',
  ENTITY_DEATH = 'ENTITY_DEATH',
  COMBAT_MISS = 'COMBAT_MISS',
}

// Tile-based positions: x/y are integer tile coordinates
// fromX/fromY + moveProgress allow client to animate tile transitions
export interface PlayerState {
  id: string;
  name: string;
  x: number;        // current tile X (integer)
  y: number;        // current tile Y (integer)
  fromX: number;    // tile moving FROM (= x when idle)
  fromY: number;
  moveProgress: number; // 0-1, how far through the tile transition (0 = at fromX/Y, 1 = at x/y)
  direction: string;
  animation: string; // 'IDLE' | 'WALK' | 'ATTACK' | 'DEAD'
  health: number;
  maxHealth: number;
  isMoving: boolean;
  isRunning: boolean;
  isAttacking: boolean;
  targetId: string | null;
}

export interface EnemyState {
  id: string;
  enemyType: string;
  x: number;        // current tile X (integer)
  y: number;        // current tile Y (integer)
  fromX: number;    // tile moving FROM
  fromY: number;
  moveProgress: number;
  direction: string;
  animation: string;
  health: number;
  maxHealth: number;
  isMoving: boolean;
}

export interface ServerWelcomeMessage { type: ServerMessageType.WELCOME; playerId: string; worldWidth: number; worldHeight: number; tick: number; }
export interface ServerStateUpdateMessage { type: ServerMessageType.STATE_UPDATE; tick: number; players: PlayerState[]; enemies: EnemyState[]; ack: number; }
export interface ServerPlayerJoinedMessage { type: ServerMessageType.PLAYER_JOINED; player: PlayerState; }
export interface ServerPlayerLeftMessage { type: ServerMessageType.PLAYER_LEFT; playerId: string; }
export interface ServerChatMessage { type: ServerMessageType.CHAT; playerId: string; name: string; text: string; }
export interface ServerDamageMessage { type: ServerMessageType.DAMAGE; targetId: string; damage: number; attackerId: string; targetHealth: number; }
export interface ServerEntityDeathMessage { type: ServerMessageType.ENTITY_DEATH; entityId: string; killerId: string; entityType: string; }
export interface ServerCombatMissMessage { type: ServerMessageType.COMBAT_MISS; targetId: string; attackerId: string; }

export type ServerMessage = ServerWelcomeMessage | ServerStateUpdateMessage | ServerPlayerJoinedMessage | ServerPlayerLeftMessage | ServerChatMessage | ServerDamageMessage | ServerEntityDeathMessage | ServerCombatMissMessage;
