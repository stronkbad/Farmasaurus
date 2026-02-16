import { Application, Container, Text } from 'pixi.js';
import { GameSocket } from './network/socket';
import { KeyboardInput } from './input/keyboard';
import { MouseInput } from './input/mouse';
import { Camera } from './rendering/camera';
import { TileMap } from './rendering/tilemap';
import { worldToScreen } from './rendering/isometric';
import { PlayerEntity } from './entities/player';
import { EnemyEntity } from './entities/enemy';
import { ChatUI } from './ui/chat';
import { isTerrainWalkable } from '@shared/terrain';
import {
  ClientMessageType,
  ServerMessageType,
  type ServerMessage,
  type ServerStateUpdateMessage,
  type ServerWelcomeMessage,
  type ServerPlayerJoinedMessage,
  type ServerPlayerLeftMessage,
  type ServerChatMessage,
  type ServerDamageMessage,
  type ServerEntityDeathMessage,
  type ServerCombatMissMessage,
} from '@shared/messages';
import { TICK_MS, MELEE_RANGE, PLAYER_WALK_MS } from '@shared/constants';
import { DIR_DX, DIR_DY, type Direction } from '@shared/types';

// Smooth easing for tile-to-tile movement (ease-in-out cubic)
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
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
let predictedMoveState: 'idle' | 'moving' = 'idle';
const pendingInputs: { seq: number; direction: Direction | null; resultTileX: number; resultTileY: number }[] = [];

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
  const floatingTextLayer = new Container();

  const camera = new Camera(worldContainer, app.screen.width, app.screen.height);

  const tilemap = new TileMap();
  worldContainer.addChild(tilemap.container);
  worldContainer.addChild(entityLayer);
  worldContainer.addChild(floatingTextLayer);

  const keyboard = new KeyboardInput();
  const mouse = new MouseInput(camera);
  mouse.attach(app.canvas);

  const socket = new GameSocket();
  const chat = new ChatUI(socket, keyboard);
  const coordsEl = document.getElementById('coords')!;

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
          camera.snapTo(screen.screenX, screen.screenY);
        }

        // Update health/stats only (NOT visual position — that's prediction-driven)
        localPlayer.health = ps.health;
        localPlayer.maxHealth = ps.maxHealth;
        localPlayer.name = ps.name;
        localPlayer.direction = ps.direction;

        // Server reconciliation: discard acknowledged inputs
        const ackSeq = update.ack;
        while (pendingInputs.length > 0 && pendingInputs[0].seq <= ackSeq) {
          pendingInputs.shift();
        }

        // Re-predict from server's authoritative tile position
        let reconciledX = ps.x;
        let reconciledY = ps.y;
        for (const input of pendingInputs) {
          if (input.direction) {
            reconciledX = input.resultTileX;
            reconciledY = input.resultTileY;
          }
        }

        // Only correct if prediction actually diverged from server
        if (reconciledX !== predictedTileX || reconciledY !== predictedTileY) {
          predictedTileX = reconciledX;
          predictedTileY = reconciledY;
          // If we're idle, snap from position too
          if (predictedMoveState === 'idle') {
            predictedFromX = reconciledX;
            predictedFromY = reconciledY;
          }
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
    c.x = screen.screenX + (Math.random() - 0.5) * 16;
    c.y = screen.screenY - 28;
    // Start slightly scaled up for impact, then shrink
    c.scale.set(1.3);
    layer.addChild(c);
    floatingTexts.push({ container: c, age: 0, maxAge: 1500 });
  }

  // ============================================
  // Game loop
  // ============================================
  let inputAccumulator = 0;

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS;

    // Advance local prediction movement timer
    if (predictedMoveState === 'moving') {
      predictedMoveTimer += dt;
      if (predictedMoveTimer >= PLAYER_WALK_MS) {
        // Arrive at destination tile
        predictedFromX = predictedTileX;
        predictedFromY = predictedTileY;

        // Chain into next move immediately if direction held (no pause between tiles)
        const nextDir = keyboard.getDirection();
        if (nextDir) {
          const dx = DIR_DX[nextDir];
          const dy = DIR_DY[nextDir];
          const nx = predictedTileX + dx;
          const ny = predictedTileY + dy;
          if (nx >= 1 && ny >= 1 && isTerrainWalkable(nx, ny)) {
            predictedFromX = predictedTileX;
            predictedFromY = predictedTileY;
            predictedTileX = nx;
            predictedTileY = ny;
            // Carry over excess time for seamless chaining
            predictedMoveTimer = predictedMoveTimer - PLAYER_WALK_MS;
          } else {
            predictedMoveState = 'idle';
            predictedMoveTimer = 0;
          }
        } else {
          predictedMoveState = 'idle';
          predictedMoveTimer = 0;
        }
      }
    }

    // Send input at fixed tick rate
    inputAccumulator += dt;
    while (inputAccumulator >= TICK_MS) {
      inputAccumulator -= TICK_MS;

      if (myPlayerId && socket.connected) {
        const direction = keyboard.getDirection();
        const seq = ++inputSeq;

        socket.send({ type: ClientMessageType.INPUT, direction, seq });

        // Client-side tile prediction
        if (direction && predictedMoveState === 'idle') {
          const dx = DIR_DX[direction];
          const dy = DIR_DY[direction];
          const nx = predictedTileX + dx;
          const ny = predictedTileY + dy;

          // Bounds + terrain check (can't check full occupancy client-side)
          if (nx >= 1 && ny >= 1 && isTerrainWalkable(nx, ny)) {
            predictedFromX = predictedTileX;
            predictedFromY = predictedTileY;
            predictedTileX = nx;
            predictedTileY = ny;
            predictedMoveState = 'moving';
            predictedMoveTimer = 0;

            pendingInputs.push({ seq, direction, resultTileX: nx, resultTileY: ny });
          }
        } else if (direction) {
          // Still moving - queue for later but don't predict movement yet
          pendingInputs.push({ seq, direction, resultTileX: predictedTileX, resultTileY: predictedTileY });
        }
      }
    }

    // Update local player visual position based on prediction
    if (localPlayer) {
      if (predictedMoveState === 'moving') {
        const rawProgress = Math.min(predictedMoveTimer / PLAYER_WALK_MS, 1);
        const progress = smoothStep(rawProgress);
        localPlayer.setTileMove(predictedFromX, predictedFromY, predictedTileX, predictedTileY, progress);
      } else {
        localPlayer.setPosition(predictedTileX, predictedTileY);
      }

      localPlayer.update(dt);

      // Update tilemap viewport based on player position
      tilemap.updateView(localPlayer.worldX, localPlayer.worldY);

      const screen = worldToScreen(localPlayer.worldX, localPlayer.worldY);
      camera.setTarget(screen.screenX, screen.screenY);
      camera.update();

      coordsEl.textContent = `${predictedTileX}\u00B0N ${predictedTileY}\u00B0E`;
    }

    for (const rp of remotePlayers.values()) rp.update(dt);
    for (const enemy of enemies.values()) enemy.update(dt);

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

    entityLayer.children.sort((a, b) => a.y - b.y);
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
