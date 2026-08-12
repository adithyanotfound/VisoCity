import WebSocket from 'ws';
import type { MayorCommand, ServerMessage } from '@visoagent/protocol';

export class TestWebSocketClient {
  private ws: WebSocket | null = null;
  private receivedMessages: ServerMessage[] = [];
  private rawMessages: string[] = [];
  private messageWaiters: Array<{
    predicate: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  constructor(public readonly url: string) {}

  public async connect(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.ws = socket;

      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new Error(`WebSocket connection timeout to ${this.url}`));
      }, timeoutMs);

      socket.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.on('message', (data: WebSocket.RawData) => {
        const text = data.toString('utf-8');
        this.rawMessages.push(text);
        try {
          const parsed = JSON.parse(text) as ServerMessage;
          this.receivedMessages.push(parsed);

          // Check if any waiters match
          for (let i = this.messageWaiters.length - 1; i >= 0; i--) {
            const waiter = this.messageWaiters[i];
            if (waiter.predicate(parsed)) {
              clearTimeout(waiter.timeoutId);
              this.messageWaiters.splice(i, 1);
              waiter.resolve(parsed);
            }
          }
        } catch {
          // ignore unparsed raw frame
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  public send(command: MayorCommand | Record<string, unknown> | string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    const payload = typeof command === 'string' ? command : JSON.stringify(command);
    this.ws.send(payload);
  }

  public async waitForMessage(
    predicate: (msg: ServerMessage) => boolean = () => true,
    timeoutMs = 5000,
  ): Promise<ServerMessage> {
    // First check if already in received messages
    const existing = this.receivedMessages.find(predicate);
    if (existing) {
      return existing;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.messageWaiters.findIndex((w) => w.timeoutId === timeoutId);
        if (index !== -1) {
          this.messageWaiters.splice(index, 1);
        }
        reject(new Error(`Timed out waiting for WebSocket message after ${timeoutMs}ms`));
      }, timeoutMs);

      this.messageWaiters.push({
        predicate,
        resolve,
        reject,
        timeoutId,
      });
    });
  }

  public async waitForMessageType<T extends ServerMessage['type']>(
    type: T,
    timeoutMs = 5000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const msg = await this.waitForMessage((m) => m.type === type, timeoutMs);
    return msg as Extract<ServerMessage, { type: T }>;
  }

  public getMessages(): ServerMessage[] {
    return [...this.receivedMessages];
  }

  public getRawMessages(): string[] {
    return [...this.rawMessages];
  }

  public async close(): Promise<void> {
    for (const waiter of this.messageWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(new Error('WebSocket closed while waiting for message'));
    }
    this.messageWaiters = [];

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
