import { GameSocket } from '../network/socket';
import { ClientMessageType } from '@shared/messages';
import type { KeyboardInput } from '../input/keyboard';

export class ChatUI {
  #socket: GameSocket;
  #keyboard: KeyboardInput;
  #log: HTMLElement;
  #input: HTMLInputElement;
  #container: HTMLElement;

  constructor(socket: GameSocket, keyboard: KeyboardInput) {
    this.#socket = socket;
    this.#keyboard = keyboard;
    this.#log = document.getElementById('chat-log')!;
    this.#input = document.getElementById('chat-input') as HTMLInputElement;
    this.#container = document.getElementById('chat-container')!;

    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this.#input.value.trim()) {
          this.#socket.send({
            type: ClientMessageType.CHAT,
            text: this.#input.value.trim(),
          });
          this.#input.value = '';
        }
        this.#input.blur();
        this.#keyboard.setChatMode(false);
        e.stopPropagation();
      } else if (e.key === 'Escape') {
        this.#input.blur();
        this.#keyboard.setChatMode(false);
        e.stopPropagation();
      }
      e.stopPropagation();
    });

    this.#input.addEventListener('focus', () => {
      this.#keyboard.setChatMode(true);
    });

    this.#input.addEventListener('blur', () => {
      this.#keyboard.setChatMode(false);
    });

    // Global Enter to focus chat
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.#input) {
        this.#input.focus();
        e.preventDefault();
      }
    });
  }

  show(): void {
    this.#container.style.display = 'block';
  }

  addMessage(name: string, text: string): void {
    const line = document.createElement('div');
    line.innerHTML = `<strong style="color:#8c8">${this.#escapeHtml(name)}:</strong> ${this.#escapeHtml(text)}`;
    this.#log.appendChild(line);
    this.#log.scrollTop = this.#log.scrollHeight;
  }

  addSystemMessage(text: string): void {
    const line = document.createElement('div');
    line.innerHTML = `<em style="color:#888">${this.#escapeHtml(text)}</em>`;
    this.#log.appendChild(line);
    this.#log.scrollTop = this.#log.scrollHeight;
  }

  #escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
