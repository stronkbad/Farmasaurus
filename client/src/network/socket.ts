import type { ClientMessage, ServerMessage } from '@shared/messages';
import { SERVER_PORT } from '@shared/constants';

export type MessageHandler = (msg: ServerMessage) => void;

export class GameSocket {
  #ws: WebSocket | null = null;
  #handlers: MessageHandler[] = [];
  #connected = false;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // In dev mode, Vite proxy handles /ws → server
      // In production, connect directly
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port === '3000' ? SERVER_PORT.toString() : window.location.port;
      const url = `${protocol}//${host}:${port}`;

      this.#ws = new WebSocket(url);

      this.#ws.onopen = () => {
        console.log('Connected to server');
        this.#connected = true;
        resolve();
      };

      this.#ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          for (const handler of this.#handlers) {
            handler(msg);
          }
        } catch (e) {
          console.error('Failed to parse server message:', e);
        }
      };

      this.#ws.onclose = () => {
        console.log('Disconnected from server');
        this.#connected = false;
      };

      this.#ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        reject(err);
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.#ws && this.#connected) {
      this.#ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): void {
    this.#handlers.push(handler);
  }

  get connected(): boolean {
    return this.#connected;
  }
}
