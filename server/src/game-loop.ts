import {
  ServerMessageType,
  type ServerStateUpdateMessage,
} from '../../shared/messages';
import { TICK_MS } from '../../shared/constants';
import { PlayerManager } from './player-manager';
import { EntityManager } from './entity-manager';

export class GameLoop {
  #playerManager: PlayerManager;
  #entityManager: EntityManager;
  #tick: number = 0;
  #broadcast: ((data: string) => void) | null = null;
  #intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(playerManager: PlayerManager) {
    this.#playerManager = playerManager;
    this.#entityManager = new EntityManager();
  }

  get tick(): number {
    return this.#tick;
  }

  setBroadcast(fn: (data: string) => void): void {
    this.#broadcast = fn;
    this.#playerManager.setBroadcast(fn);
    this.#entityManager.setBroadcast(fn);
  }

  start(): void {
    this.#entityManager.spawnInitialEnemies();

    this.#intervalId = setInterval(() => {
      this.#update();
    }, TICK_MS);
    console.log(`Game loop started at ${1000 / TICK_MS} TPS`);
  }

  stop(): void {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  #update(): void {
    this.#tick++;

    // 1. Build occupancy map from all current entity positions
    this.#entityManager.buildOccupancy(this.#playerManager.getPlayerTiles());

    // 2. Process player tile movement (checks occupancy for collision)
    this.#playerManager.updateAll((x, y) => this.#entityManager.isTileWalkable(x, y));

    // 3. Rebuild occupancy after player moves
    this.#entityManager.buildOccupancy(this.#playerManager.getPlayerTiles());

    // 4. Process combat (players attacking enemies)
    this.#playerManager.processCombat(
      (id) => this.#entityManager.getEnemy(id),
      (id, dmg, attackerId) => this.#entityManager.damageEnemy(id, dmg, attackerId),
    );

    // 5. Update enemies (AI, tile movement - checks occupancy)
    this.#entityManager.updateAll(this.#playerManager.getPlayersPositions());

    // 6. Broadcast state to all clients
    if (this.#broadcast) {
      const playerStates = this.#playerManager.getAllPlayerStates();

      for (const [id, player] of this.#playerManager.entries()) {
        const stateUpdate: ServerStateUpdateMessage = {
          type: ServerMessageType.STATE_UPDATE,
          tick: this.#tick,
          players: playerStates,
          enemies: this.#entityManager.getAllEnemyStates(),
          ack: player.lastProcessedSeq,
        };
        player.ws.send(JSON.stringify(stateUpdate));
      }
    }
  }
}
