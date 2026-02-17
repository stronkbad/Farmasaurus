import { Application, Container, Graphics, Text } from 'pixi.js';
import { GameSocket } from './network/socket';
import { KeyboardInput } from './input/keyboard';
import { MouseInput } from './input/mouse';
import { MouseMovementInput } from './input/mouse-movement';
import { Camera } from './rendering/camera';
import { TileMap } from './rendering/tilemap';
import { worldToScreen, screenToWorld } from './rendering/isometric';
import { PlayerEntity } from './entities/player';
import { EnemyEntity } from './entities/enemy';
import { ChatUI } from './ui/chat';
import { isTerrainWalkable, isElevationWalkable, getTileElevation, getTileType, Z_PIXEL_HEIGHT } from '@shared/terrain';
import {
  ClientMessageType,
  ServerMessageType,
  type ServerMessage,
  type ServerStateUpdateMessage,
  type ServerMoveAckMessage,
  type ServerWelcomeMessage,
  type ServerPlayerJoinedMessage,
  type ServerPlayerLeftMessage,
  type ServerChatMessage,
  type ServerDamageMessage,
  type ServerEntityDeathMessage,
  type ServerCombatMissMessage,
} from '@shared/messages';
import { MELEE_RANGE, PLAYER_WALK_MS, PLAYER_RUN_MS, TILE_WIDTH, TILE_HEIGHT } from '@shared/constants';
import { DIR_DX, DIR_DY, type Direction } from '@shared/types';

/** Check if a tile is occupied by an enemy or remote player. */
function isTileOccupied(x: number, y: number): boolean {
  for (const enemy of enemies.values()) {
    if (enemy.tileX === x && enemy.tileY === y) return true;
  }
  for (const rp of remotePlayers.values()) {
    if (rp.tileX === x && rp.tileY === y) return true;
  }
  return false;
}

/** Client-side move validation — mirrors server checks (terrain, elevation, occupancy, diagonal perpendiculars). */
function canPredictMove(fromX: number, fromY: number, dx: number, dy: number): boolean {
  const nx = fromX + dx;
  const ny = fromY + dy;
  if (nx < 1 || ny < 1) return false;
  if (!isTerrainWalkable(nx, ny)) return false;
  if (!isElevationWalkable(fromX, fromY, nx, ny)) return false;
  if (isTileOccupied(nx, ny)) return false;
  if (dx !== 0 && dy !== 0) {
    const canHoriz = isTerrainWalkable(fromX + dx, fromY) && isElevationWalkable(fromX, fromY, fromX + dx, fromY) && !isTileOccupied(fromX + dx, fromY);
    const canVert = isTerrainWalkable(fromX, fromY + dy) && isElevationWalkable(fromX, fromY, fromX, fromY + dy) && !isTileOccupied(fromX, fromY + dy);
    if (!canHoriz || !canVert) return false;
  }
  return true;
}

/** Try diagonal first, then fall back to cardinal components (matches enemy AI behavior). */
function resolveMoveDirection(fromX: number, fromY: number, dx: number, dy: number): { dx: number; dy: number } | null {
  if (canPredictMove(fromX, fromY, dx, dy)) return { dx, dy };
  if (dx !== 0 && dy !== 0) {
    if (canPredictMove(fromX, fromY, dx, 0)) return { dx, dy: 0 };
    if (canPredictMove(fromX, fromY, 0, dy)) return { dx: 0, dy };
  }
  return null;
}

/** Find the nearest walkable tile to a target position (for click-on-collision snapping). */
function findNearestWalkableTile(targetX: number, targetY: number): { x: number; y: number } | null {
  if (isTerrainWalkable(targetX, targetY)) return { x: targetX, y: targetY };
  for (let r = 1; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only ring border
        const nx = targetX + dx;
        const ny = targetY + dy;
        if (isTerrainWalkable(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

// ============================================
// Game State
// ============================================
let myPlayerId: string | null = null;
let localPlayer: PlayerEntity | null = null;
const remotePlayers: Map<string, PlayerEntity> = new Map();
const enemies: Map<string, EnemyEntity> = new Map();
let inputSeq = 0;

// Tile-based client prediction
let predictedTileX = 0;
let predictedTileY = 0;
let predictedFromX = 0;
let predictedFromY = 0;
let predictedMoveTimer = 0;
let predictedMoveDuration = PLAYER_WALK_MS;
let predictedIsRunning = false;
let predictedDirection: Direction | null = null; // latched direction for current step
let predictedMoveState: 'idle' | 'moving' = 'idle';

// Click-to-move target
let moveTargetTileX: number | null = null;
let moveTargetTileY: number | null = null;

/** Compute the best 8-direction step from one tile toward another. */
function directionToward(fromX: number, fromY: number, toX: number, toY: number): Direction | null {
  if (fromX === toX && fromY === toY) return null;
  const sdx = Math.sign(toX - fromX);
  const sdy = Math.sign(toY - fromY);
  if (sdx === 0 && sdy === -1) return 'UP';
  if (sdx === 1 && sdy === -1) return 'UP_RIGHT';
  if (sdx === 1 && sdy === 0) return 'RIGHT';
  if (sdx === 1 && sdy === 1) return 'DOWN_RIGHT';
  if (sdx === 0 && sdy === 1) return 'DOWN';
  if (sdx === -1 && sdy === 1) return 'DOWN_LEFT';
  if (sdx === -1 && sdy === 0) return 'LEFT';
  if (sdx === -1 && sdy === -1) return 'UP_LEFT';
  return null;
}

// Floating damage text
interface FloatingText { container: Container; age: number; maxAge: number; }
const floatingTexts: FloatingText[] = [];

// ============================================
// Bootstrap
// ============================================
async function main() {
  const app = new Application();
  await app.init({
    background: 0x0a0806,
    resizeTo: window,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const gameContainer = document.getElementById('game-container')!;
  gameContainer.appendChild(app.canvas);

  const worldContainer = new Container();
  app.stage.addChild(worldContainer);

  const entityLayer = new Container();
  entityLayer.sortableChildren = true;
  const floatingTextLayer = new Container();

  const camera = new Camera(worldContainer, app.screen.width, app.screen.height);

  const tilemap = new TileMap();
  worldContainer.addChild(tilemap.container);
  const debugHitboxLayer = new Graphics();
  debugHitboxLayer.visible = false; // Toggle with F3
  worldContainer.addChild(debugHitboxLayer);
  worldContainer.addChild(entityLayer);
  worldContainer.addChild(floatingTextLayer);

  // F3 toggles debug hitbox overlay
  let debugHitboxEnabled = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      debugHitboxEnabled = !debugHitboxEnabled;
      debugHitboxLayer.visible = debugHitboxEnabled;
      tilemap.showHitboxes = debugHitboxEnabled;
      if (!debugHitboxEnabled) debugHitboxLayer.clear();
    }
  });

  const keyboard = new KeyboardInput();
  const mouse = new MouseInput(camera);
  mouse.attach(app.canvas);
  const mouseMovement = new MouseMovementInput();
  mouseMovement.attach(app.canvas);

  const socket = new GameSocket();
  const chat = new ChatUI(socket, keyboard);
  const coordsEl = document.getElementById('coords')!;
  const debugEl = document.getElementById('debug-metrics')!;

  // Debug metrics
  let frameCount = 0;
  let fpsAccum = 0;
  let currentFps = 0;
  let moveTimeAccum = 0; // cumulative moveDt since last arrival (movement-system time)
  let lastTileTransitionMs = 0;
  let tilesPerSec = 0;
  let tilesMoved = 0;
  let tilesMovedAccum = 0;
  let tilesMovedTimer = 0;
  let debugMetricsTimer = 0;

  // ============================================
  // Click-to-attack
  // ============================================
  mouse.onClick((event) => {
    if (!myPlayerId || !localPlayer) return;

    let closestEnemy: EnemyEntity | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies.values()) {
      const dist = Math.max(
        Math.abs(Math.round(enemy.worldX) - event.worldX),
        Math.abs(Math.round(enemy.worldY) - event.worldY),
      );
      if (dist < 2 && dist < closestDist) {
        closestDist = dist;
        closestEnemy = enemy;
      }
    }

    if (closestEnemy) {
      const playerDist = Math.max(
        Math.abs(Math.round(closestEnemy.worldX) - predictedTileX),
        Math.abs(Math.round(closestEnemy.worldY) - predictedTileY),
      );
      if (playerDist <= MELEE_RANGE + 1) {
        socket.send({ type: ClientMessageType.ATTACK, targetId: closestEnemy.id });
        localPlayer.triggerAttack(closestEnemy.worldX, closestEnemy.worldY);
      } else {
        spawnFloatingText('Too far', predictedTileX, predictedTileY, 0xccaa44, floatingTextLayer);
      }
    }
  });

  // ============================================
  // Server messages
  // ============================================
  socket.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case ServerMessageType.WELCOME: {
        const welcome = msg as ServerWelcomeMessage;
        myPlayerId = welcome.playerId;
        document.getElementById('hud')!.style.display = 'block';
        coordsEl.style.display = 'block';
        chat.show();
        chat.addSystemMessage('Thou hast entered the Lootlands.');
        break;
      }

      case ServerMessageType.STATE_UPDATE: {
        const update = msg as ServerStateUpdateMessage;
        handleStateUpdate(update, entityLayer);
        break;
      }

      case ServerMessageType.MOVE_ACK: {
        const ack = msg as ServerMoveAckMessage;
        if (!ack.accepted) {
          // Server rejected the move — reset prediction to server's authoritative position.
          // This feels like a "bump" into a wall, not a rubber-band rewind.
          predictedTileX = ack.tileX;
          predictedTileY = ack.tileY;
          predictedFromX = ack.tileX;
          predictedFromY = ack.tileY;
          predictedMoveState = 'idle';
          predictedMoveTimer = 0;
          predictedDirection = null;
          moveTargetTileX = null;
          moveTargetTileY = null;
        }
        break;
      }

      case ServerMessageType.PLAYER_JOINED: {
        const joinMsg = msg as ServerPlayerJoinedMessage;
        if (joinMsg.player.id !== myPlayerId) {
          const rp = new PlayerEntity(joinMsg.player.id, joinMsg.player.name, false);
          rp.applyState(joinMsg.player);
          remotePlayers.set(joinMsg.player.id, rp);
          entityLayer.addChild(rp.container);
          chat.addSystemMessage(`${joinMsg.player.name} has entered the world.`);
        }
        break;
      }

      case ServerMessageType.PLAYER_LEFT: {
        const leftMsg = msg as ServerPlayerLeftMessage;
        const rp = remotePlayers.get(leftMsg.playerId);
        if (rp) {
          entityLayer.removeChild(rp.container);
          remotePlayers.delete(leftMsg.playerId);
          chat.addSystemMessage(`${rp.name} has departed.`);
        }
        break;
      }

      case ServerMessageType.CHAT: {
        const chatMsg = msg as ServerChatMessage;
        chat.addMessage(chatMsg.name, chatMsg.text);
        break;
      }

      case ServerMessageType.DAMAGE: {
        const dmgMsg = msg as ServerDamageMessage;
        const targetEnemy = enemies.get(dmgMsg.targetId);
        if (targetEnemy) {
          // Floating damage number
          spawnFloatingText(`${dmgMsg.damage}`, targetEnemy.worldX, targetEnemy.worldY, 0xff2222, floatingTextLayer);
          targetEnemy.health = dmgMsg.targetHealth;
          // Hit flash + recoil on the enemy
          const attacker = dmgMsg.attackerId === myPlayerId && localPlayer
            ? localPlayer : remotePlayers.get(dmgMsg.attackerId);
          const fromX = attacker ? attacker.worldX : targetEnemy.worldX;
          const fromY = attacker ? attacker.worldY : targetEnemy.worldY;
          targetEnemy.triggerHitFlash(fromX, fromY);
        }
        break;
      }

      case ServerMessageType.ENTITY_DEATH: {
        const deathMsg = msg as ServerEntityDeathMessage;
        const deadEnemy = enemies.get(deathMsg.entityId);
        if (deadEnemy) {
          spawnFloatingText('Dead!', deadEnemy.worldX, deadEnemy.worldY, 0xcc4444, floatingTextLayer);
          // Only show kill message to the player who got the kill
          if (deathMsg.killerId === myPlayerId) {
            const name = deadEnemy.enemyType === 'SPIDER' ? 'a giant spider'
              : deadEnemy.enemyType === 'SKELETON' ? 'a skeleton'
              : deadEnemy.enemyType === 'ORC' ? 'an orc' : 'a creature';
            chat.addSystemMessage(`Thou hast slain ${name}!`);
          }
        }
        break;
      }

      case ServerMessageType.COMBAT_MISS: {
        const missMsg = msg as ServerCombatMissMessage;
        // Only show miss to the player who attacked
        if (missMsg.attackerId === myPlayerId) {
          const missTarget = enemies.get(missMsg.targetId);
          if (missTarget) {
            spawnFloatingText('Miss', missTarget.worldX, missTarget.worldY, 0x888888, floatingTextLayer);
          }
        }
        break;
      }
    }
  });

  // ============================================
  // Name dialog
  // ============================================
  const nameDialog = document.getElementById('name-dialog')!;
  const nameInput = document.getElementById('name-input') as HTMLInputElement;
  const nameSubmit = document.getElementById('name-submit')!;

  async function joinGame() {
    const name = nameInput.value.trim() || 'Adventurer';
    nameDialog.style.display = 'none';
    try {
      await socket.connect();
      socket.send({ type: ClientMessageType.JOIN, name });
    } catch (err) {
      console.error('Failed to connect:', err);
      nameDialog.style.display = 'flex';
    }
  }

  nameSubmit.addEventListener('click', joinGame);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
  nameInput.focus();

  // ============================================
  // State update handler
  // ============================================
  function handleStateUpdate(update: ServerStateUpdateMessage, entityLayer: Container) {
    for (const ps of update.players) {
      if (ps.id === myPlayerId) {
        if (!localPlayer) {
          localPlayer = new PlayerEntity(ps.id, ps.name, true);
          entityLayer.addChild(localPlayer.container);
          predictedTileX = ps.x;
          predictedTileY = ps.y;
          predictedFromX = ps.fromX;
          predictedFromY = ps.fromY;
          const screen = worldToScreen(ps.x, ps.y);
          const spawnZ = getTileElevation(ps.x, ps.y);
          camera.snapTo(screen.screenX, screen.screenY - spawnZ * Z_PIXEL_HEIGHT);
        }

        // Update health/stats only (NOT visual position or direction — those are prediction-driven)
        localPlayer.health = ps.health;
        localPlayer.maxHealth = ps.maxHealth;
        localPlayer.name = ps.name;
        // Direction is set from prediction below, not from server (avoids 33ms lag flicker)

        // Server reconciliation: MOVE_ACK handles per-step validation.
        // This is only a safety net for extreme drift (network hiccup, reconnect, etc).
        const drift = Math.max(
          Math.abs(ps.x - predictedTileX),
          Math.abs(ps.y - predictedTileY),
        );
        if (drift > 3) {
          // Emergency teleport — something seriously wrong
          predictedTileX = ps.x;
          predictedTileY = ps.y;
          predictedFromX = ps.x;
          predictedFromY = ps.y;
          predictedMoveState = 'idle';
          predictedMoveTimer = 0;
          predictedDirection = null;
        }

        const hpPct = (ps.health / ps.maxHealth) * 100;
        document.getElementById('health-fill')!.style.width = `${hpPct}%`;
      } else {
        let rp = remotePlayers.get(ps.id);
        if (!rp) {
          rp = new PlayerEntity(ps.id, ps.name, false);
          remotePlayers.set(ps.id, rp);
          entityLayer.addChild(rp.container);
        }
        rp.applyState(ps);
      }
    }

    for (const [id, rp] of remotePlayers) {
      if (!update.players.find((p) => p.id === id)) {
        entityLayer.removeChild(rp.container);
        remotePlayers.delete(id);
      }
    }

    for (const es of update.enemies) {
      let enemy = enemies.get(es.id);
      if (!enemy) {
        enemy = new EnemyEntity(es.id, es.enemyType);
        enemy.worldX = es.x;
        enemy.worldY = es.y;
        enemies.set(es.id, enemy);
        entityLayer.addChild(enemy.container);
      }
      enemy.applyState(es);
    }

    for (const [id, enemy] of enemies) {
      if (!update.enemies.find((e) => e.id === id)) {
        entityLayer.removeChild(enemy.container);
        enemies.delete(id);
      }
    }
  }

  // ============================================
  // Floating damage text
  // ============================================
  function spawnFloatingText(text: string, worldX: number, worldY: number, color: number, layer: Container) {
    const c = new Container();
    const t = new Text({
      text,
      style: {
        fontFamily: '"Press Start 2P", monospace', fontSize: 10,
        fill: color, stroke: { color: 0x000000, width: 4 },
      },
    });
    t.anchor.set(0.5);
    c.addChild(t);
    const screen = worldToScreen(worldX, worldY);
    const ftZ = getTileElevation(Math.round(worldX), Math.round(worldY));
    c.x = screen.screenX + (Math.random() - 0.5) * 16;
    c.y = screen.screenY - ftZ * Z_PIXEL_HEIGHT - 28;
    // Start slightly scaled up for impact, then shrink
    c.scale.set(1.3);
    layer.addChild(c);
    floatingTexts.push({ container: c, age: 0, maxAge: 1500 });
  }

  // ============================================
  // Game loop
  // ============================================
  /** Convert screen click position to a snapped walkable target tile. */
  function screenToTargetTile(screenX: number, screenY: number): { x: number; y: number } | null {
    const worldScreenPos = camera.screenToWorld(screenX, screenY);
    const world = screenToWorld(worldScreenPos.x, worldScreenPos.y);
    const rawX = Math.round(world.worldX);
    const rawY = Math.round(world.worldY);
    return findNearestWalkableTile(rawX, rawY);
  }

  // Unified input following ChatGPT movement architecture:
  // - Intent is discrete and stateful (latched at step boundaries)
  // - Direction computed in viewport space (camera-independent via character-to-cursor angle)
  // - Held mouse = octant direction (stable), click-release = target tile (pathfinding)
  function getMovementInput(): { direction: Direction | null; running: boolean } {
    // WASD always takes priority and cancels any click-to-move target
    const kbDir = keyboard.getDirection();
    if (kbDir) {
      moveTargetTileX = null;
      moveTargetTileY = null;
      return { direction: kbDir, running: false };
    }

    // Right-click HELD: compute octant direction from character→cursor angle.
    // This is stable because it uses viewport-space angle, not screen-to-world tile conversion.
    // Camera movement does not affect the character-to-cursor vector.
    if (mouseMovement.isActive) {
      moveTargetTileX = null; // held movement overrides any click-to-move target
      moveTargetTileY = null;
      const movement = mouseMovement.getMovement();
      return { direction: movement.direction, running: movement.running };
    }

    // Process pending right-click (click-and-release: sets a destination tile)
    if (mouseMovement.hasPendingClick) {
      const target = screenToTargetTile(mouseMovement.pendingClickScreenX, mouseMovement.pendingClickScreenY);
      mouseMovement.consumeClick();
      if (target) {
        moveTargetTileX = target.x;
        moveTargetTileY = target.y;
      }
    }

    // Move toward target tile if one is set (click-to-move pathfinding)
    if (moveTargetTileX !== null && moveTargetTileY !== null) {
      // Already at target?
      if (predictedTileX === moveTargetTileX && predictedTileY === moveTargetTileY) {
        moveTargetTileX = null;
        moveTargetTileY = null;
        return { direction: null, running: false };
      }

      const dir = directionToward(predictedTileX, predictedTileY, moveTargetTileX, moveTargetTileY);
      const dist = Math.max(
        Math.abs(moveTargetTileX - predictedTileX),
        Math.abs(moveTargetTileY - predictedTileY),
      );
      // Hysteresis: start running at dist > 3, keep running until dist <= 1
      const shouldRun = predictedIsRunning ? dist > 1 : dist > 3;
      return { direction: dir, running: shouldRun };
    }

    return { direction: null, running: false };
  }

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS;

    // Feed character viewport position to mouse movement input
    if (localPlayer) {
      const screen = worldToScreen(localPlayer.worldX, localPlayer.worldY);
      const viewportX = screen.screenX * camera.zoom + worldContainer.x;
      const viewportY = screen.screenY * camera.zoom + worldContainer.y;
      mouseMovement.updateCharacterScreenPos(viewportX, viewportY);
    }

    // Advance local prediction movement timer
    if (predictedMoveState === 'moving') {
      predictedMoveTimer += dt;
      moveTimeAccum += dt;
      if (predictedMoveTimer >= predictedMoveDuration) {
        // Arrive at destination tile — track metrics using movement-system time
        lastTileTransitionMs = moveTimeAccum;
        moveTimeAccum = 0;
        tilesMovedAccum++;

        predictedFromX = predictedTileX;
        predictedFromY = predictedTileY;

        // Chain into next move immediately if direction held (no pause between tiles)
        const input = getMovementInput();
        if (input.direction) {
          const dx = DIR_DX[input.direction];
          const dy = DIR_DY[input.direction];
          const resolved = resolveMoveDirection(predictedTileX, predictedTileY, dx, dy);
          if (resolved) {
            predictedFromX = predictedTileX;
            predictedFromY = predictedTileY;
            predictedTileX = predictedTileX + resolved.dx;
            predictedTileY = predictedTileY + resolved.dy;
            // Carry over excess time using the COMPLETED move's duration (not the new one)
            const oldDuration = predictedMoveDuration;
            // Latch intent for this step — won't change until step completes
            predictedDirection = input.direction;
            predictedIsRunning = input.running;
            predictedMoveDuration = input.running ? PLAYER_RUN_MS : PLAYER_WALK_MS;
            predictedMoveTimer = predictedMoveTimer - oldDuration;
            // Send intent for this new step (once per step, not per tick)
            if (socket.connected) {
              socket.send({ type: ClientMessageType.INPUT, direction: input.direction, seq: ++inputSeq, running: input.running });
            }
          } else if (moveTargetTileX !== null) {
            moveTargetTileX = null;
            moveTargetTileY = null;
            predictedMoveState = 'idle';
            predictedMoveTimer = 0;
            predictedDirection = null;
            if (socket.connected) {
              socket.send({ type: ClientMessageType.INPUT, direction: null, seq: ++inputSeq, running: false });
            }
          } else {
            predictedMoveState = 'idle';
            predictedMoveTimer = 0;
            predictedDirection = null;
            if (socket.connected) {
              socket.send({ type: ClientMessageType.INPUT, direction: null, seq: ++inputSeq, running: false });
            }
          }
        } else {
          predictedMoveState = 'idle';
          predictedMoveTimer = 0;
          predictedDirection = null;
          if (socket.connected) {
            socket.send({ type: ClientMessageType.INPUT, direction: null, seq: ++inputSeq, running: false });
          }
        }
      }
    }

    // Immediate prediction start — don't wait for the next tick boundary
    // This eliminates up to 50ms of input lag when starting from idle
    if (predictedMoveState === 'idle' && myPlayerId) {
      const input = getMovementInput();
      if (input.direction) {
        const dx = DIR_DX[input.direction];
        const dy = DIR_DY[input.direction];
        const resolved = resolveMoveDirection(predictedTileX, predictedTileY, dx, dy);
        if (resolved) {
          predictedFromX = predictedTileX;
          predictedFromY = predictedTileY;
          predictedTileX = predictedTileX + resolved.dx;
          predictedTileY = predictedTileY + resolved.dy;
          predictedMoveState = 'moving';
          predictedMoveTimer = 0;
          // Latch intent for this step — won't change until step completes
          predictedDirection = input.direction;
          predictedIsRunning = input.running;
          predictedMoveDuration = input.running ? PLAYER_RUN_MS : PLAYER_WALK_MS;
          // Send intent for this step (once per step, not per tick)
          if (socket.connected) {
            socket.send({ type: ClientMessageType.INPUT, direction: input.direction, seq: ++inputSeq, running: input.running });
          }
        } else if (moveTargetTileX !== null) {
          moveTargetTileX = null;
          moveTargetTileY = null;
        }
      }
    }


    // Update local player visual position based on prediction
    if (localPlayer) {
      if (predictedMoveState === 'moving') {
        const progress = Math.min(predictedMoveTimer / predictedMoveDuration, 1);
        localPlayer.setTileMove(predictedFromX, predictedFromY, predictedTileX, predictedTileY, progress);
        localPlayer.isRunning = predictedIsRunning;
        // Set direction from prediction (no server lag)
        if (predictedDirection) localPlayer.direction = predictedDirection;
      } else {
        localPlayer.setPosition(predictedTileX, predictedTileY);
        localPlayer.isRunning = false;
      }

      localPlayer.update(dt);

      // Update tilemap viewport based on player position
      tilemap.updateView(localPlayer.worldX, localPlayer.worldY, camera.zoom);

      const screen = worldToScreen(localPlayer.worldX, localPlayer.worldY);
      const camZ = getTileElevation(Math.round(localPlayer.worldX), Math.round(localPlayer.worldY));
      camera.setTarget(screen.screenX, screen.screenY - camZ * Z_PIXEL_HEIGHT);
      camera.update(dt);

      coordsEl.textContent = `${predictedTileX}\u00B0N ${predictedTileY}\u00B0E`;
    }

    for (const rp of remotePlayers.values()) rp.update(dt);
    for (const enemy of enemies.values()) enemy.update(dt);

    // Debug hitbox overlay — only rebuild when enabled (F3 toggle)
    if (debugHitboxEnabled) {
      const hw = TILE_WIDTH / 2;
      const hhh = TILE_HEIGHT / 2;
      debugHitboxLayer.clear();

      if (localPlayer) {
        const ps = worldToScreen(predictedTileX, predictedTileY);
        const pz = getTileElevation(predictedTileX, predictedTileY) * Z_PIXEL_HEIGHT;
        debugHitboxLayer.poly([
          { x: ps.screenX, y: ps.screenY - hhh - pz },
          { x: ps.screenX + hw, y: ps.screenY - pz },
          { x: ps.screenX, y: ps.screenY + hhh - pz },
          { x: ps.screenX - hw, y: ps.screenY - pz },
        ]);
        debugHitboxLayer.stroke({ color: 0x00ff00, width: 2, alpha: 0.9 });
      }

      for (const enemy of enemies.values()) {
        const ex = enemy.tileX;
        const ey = enemy.tileY;
        const es = worldToScreen(ex, ey);
        const ez = getTileElevation(ex, ey) * Z_PIXEL_HEIGHT;
        debugHitboxLayer.poly([
          { x: es.screenX, y: es.screenY - hhh - ez },
          { x: es.screenX + hw, y: es.screenY - ez },
          { x: es.screenX, y: es.screenY + hhh - ez },
          { x: es.screenX - hw, y: es.screenY - ez },
        ]);
        debugHitboxLayer.stroke({ color: 0xff2222, width: 2, alpha: 0.9 });
      }

      for (const rp of remotePlayers.values()) {
        const rx = rp.tileX;
        const ry = rp.tileY;
        const rs = worldToScreen(rx, ry);
        const rz = getTileElevation(rx, ry) * Z_PIXEL_HEIGHT;
        debugHitboxLayer.poly([
          { x: rs.screenX, y: rs.screenY - hhh - rz },
          { x: rs.screenX + hw, y: rs.screenY - rz },
          { x: rs.screenX, y: rs.screenY + hhh - rz },
          { x: rs.screenX - hw, y: rs.screenY - rz },
        ]);
        debugHitboxLayer.stroke({ color: 0x2222ff, width: 2, alpha: 0.9 });
      }

      if (moveTargetTileX !== null && moveTargetTileY !== null) {
        const ts = worldToScreen(moveTargetTileX, moveTargetTileY);
        const tz = getTileElevation(moveTargetTileX, moveTargetTileY) * Z_PIXEL_HEIGHT;
        debugHitboxLayer.poly([
          { x: ts.screenX, y: ts.screenY - hhh - tz },
          { x: ts.screenX + hw, y: ts.screenY - tz },
          { x: ts.screenX, y: ts.screenY + hhh - tz },
          { x: ts.screenX - hw, y: ts.screenY - tz },
        ]);
        debugHitboxLayer.stroke({ color: 0xffcc00, width: 2, alpha: 0.9 });
        debugHitboxLayer.fill({ color: 0xffcc00, alpha: 0.15 });
      }
    }

    // Floating text animation
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.age += dt;
      const lifeRatio = ft.age / ft.maxAge;
      // Float upward, accelerating slightly
      ft.container.y -= dt * (0.025 + lifeRatio * 0.02);
      // Fade out in the second half
      ft.container.alpha = lifeRatio < 0.5 ? 1 : 1 - (lifeRatio - 0.5) * 2;
      // Scale: pop in then shrink
      const scale = lifeRatio < 0.1 ? 1 + (1 - lifeRatio / 0.1) * 0.3 : 1;
      ft.container.scale.set(scale);
      if (ft.age >= ft.maxAge) {
        floatingTextLayer.removeChild(ft.container);
        floatingTexts.splice(i, 1);
      }
    }

    // Depth sorting handled by sortableChildren + zIndex set in entity classes

    // Debug metrics overlay (throttled to 4 updates/sec to avoid DOM thrash)
    frameCount++;
    fpsAccum += dt;
    tilesMovedTimer += dt;
    if (fpsAccum >= 1000) {
      currentFps = Math.round(frameCount * 1000 / fpsAccum);
      tilesPerSec = tilesMovedAccum;
      tilesMoved += tilesMovedAccum;
      tilesMovedAccum = 0;
      frameCount = 0;
      fpsAccum = 0;
      tilesMovedTimer = 0;
    }
    debugMetricsTimer += dt;
    if (debugEl && debugMetricsTimer >= 250) {
      debugMetricsTimer = 0;
      debugEl.style.display = myPlayerId ? 'block' : 'none';
      const progress = predictedMoveState === 'moving' ? (predictedMoveTimer / predictedMoveDuration * 100).toFixed(0) : '-';
      const elev = getTileElevation(predictedTileX, predictedTileY);
      const tType = getTileType(predictedTileX, predictedTileY);
      const tNames = ['DEEP_W','SHAL_W','SAND','GRASS_L','GRASS','GRASS_D','DIRT','ROCK','FOREST'];
      debugEl.textContent =
        `FPS: ${currentFps}  frameTime: ${dt.toFixed(1)}ms\n` +
        `Tile: (${predictedTileX}, ${predictedTileY})  Z: ${elev}  ${tNames[tType] || '?'}\n` +
        `Move: ${predictedMoveState}  prog: ${progress}%  dur: ${predictedMoveDuration}ms\n` +
        `Last step: ${lastTileTransitionMs.toFixed(0)}ms  tiles/s: ${tilesPerSec}\n` +
        `Entities: ${enemies.size} enemies, ${remotePlayers.size} players\n` +
        `Target: ${moveTargetTileX !== null ? `(${moveTargetTileX}, ${moveTargetTileY})` : 'none'}`;
    }
  });

  window.addEventListener('resize', () => {
    camera.resize(app.screen.width, app.screen.height);
  });

  // Scroll-wheel zoom
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom += e.deltaY < 0 ? 0.25 : -0.25;
  }, { passive: false });
}

main().catch(console.error);
