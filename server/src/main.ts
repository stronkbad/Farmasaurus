import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GameLoop } from './game-loop';
import { PlayerManager } from './player-manager';
import {
  ClientMessage,
  ClientMessageType,
  ServerMessageType,
  type ServerWelcomeMessage,
  type ServerPlayerJoinedMessage,
  type ServerPlayerLeftMessage,
  type ServerChatMessage,
} from '../../shared/messages';
import { SERVER_PORT, WORLD_TILES_X, WORLD_TILES_Y } from '../../shared/constants';

const server = createServer();
const wss = new WebSocketServer({ server });
const playerManager = new PlayerManager();
const gameLoop = new GameLoop(playerManager);

wss.on('connection', (ws: WebSocket) => {
  let playerId: string | null = null;

  ws.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case ClientMessageType.JOIN: {
        playerId = playerManager.addPlayer(ws, msg.name);
        console.log(`Player joined: ${msg.name} (${playerId})`);

        // Send welcome to the new player
        const welcome: ServerWelcomeMessage = {
          type: ServerMessageType.WELCOME,
          playerId,
          worldWidth: WORLD_TILES_X,
          worldHeight: WORLD_TILES_Y,
          tick: gameLoop.tick,
        };
        ws.send(JSON.stringify(welcome));

        // Notify other players
        const joinMsg: ServerPlayerJoinedMessage = {
          type: ServerMessageType.PLAYER_JOINED,
          player: playerManager.getPlayerState(playerId)!,
        };
        broadcast(JSON.stringify(joinMsg), ws);
        break;
      }

      case ClientMessageType.INPUT: {
        if (playerId) {
          playerManager.handleInput(playerId, msg);
        }
        break;
      }

      case ClientMessageType.CHAT: {
        if (playerId) {
          const player = playerManager.getPlayerState(playerId);
          if (player) {
            const chatMsg: ServerChatMessage = {
              type: ServerMessageType.CHAT,
              playerId,
              name: player.name,
              text: msg.text,
            };
            broadcastAll(JSON.stringify(chatMsg));
          }
        }
        break;
      }

      case ClientMessageType.ATTACK: {
        if (playerId) {
          playerManager.handleAttack(playerId, msg.targetId);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (playerId) {
      console.log(`Player left: ${playerId}`);
      playerManager.removePlayer(playerId);
      const leftMsg: ServerPlayerLeftMessage = {
        type: ServerMessageType.PLAYER_LEFT,
        playerId,
      };
      broadcastAll(JSON.stringify(leftMsg));
    }
  });
});

function broadcast(data: string, exclude?: WebSocket): void {
  wss.clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function broadcastAll(data: string): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Expose broadcast for the game loop to use
gameLoop.setBroadcast(broadcastAll);
gameLoop.start();

server.listen(SERVER_PORT, () => {
  console.log(`Lootlands Online server running on port ${SERVER_PORT}`);
});
