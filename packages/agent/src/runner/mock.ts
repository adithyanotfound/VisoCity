import type {
  AgentExecutionHandle,
  AgentExitResult,
  AgentRunner,
  AgentRunnerEvent,
  AgentRunnerOptions,
} from '../types.js';

export interface MockAgentRunnerOptions {
  name?: string;
  events?: AgentRunnerEvent[];
  delayMs?: number;
  exitCode?: number;
  errorToThrow?: Error;
  hangForever?: boolean;
  onKill?: (signal?: NodeJS.Signals) => void;
  onInput?: (input: string) => void;
  onStart?: (options: AgentRunnerOptions) => void;
}

export class MockExecutionHandle implements AgentExecutionHandle {
  public readonly pid: number = 99999;
  private alive = true;
  private killed = false;
  private eventListeners: Set<(event: AgentRunnerEvent) => void> = new Set();
  private waitPromise: Promise<AgentExitResult>;
  private resolveWait!: (res: AgentExitResult) => void;
  private abortController = new AbortController();
  private config: MockAgentRunnerOptions;

  constructor(options: AgentRunnerOptions, config: MockAgentRunnerOptions = {}) {
    this.config = config;

    this.waitPromise = new Promise<AgentExitResult>((resolve) => {
      this.resolveWait = resolve;
    });

    if (config.onStart) {
      config.onStart(options);
    }

    if (config.errorToThrow) {
      this.alive = false;
      this.resolveWait({
        exitCode: config.exitCode ?? 1,
        error: config.errorToThrow,
      });
      return;
    }

    if (!config.hangForever) {
      this.executeScript(config.events ?? [], config.delayMs ?? 5, config.exitCode ?? 0);
    }
  }

  private async executeScript(
    events: AgentRunnerEvent[],
    delayMs: number,
    exitCode: number,
  ): Promise<void> {
    for (const ev of events) {
      if (!this.alive || this.killed) break;
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      if (!this.alive || this.killed) break;
      this.emitEvent(ev);
    }

    if (this.alive && !this.killed) {
      this.alive = false;
      this.resolveWait({
        exitCode,
        error: exitCode === 0 ? undefined : new Error(`Mock process exited with code ${exitCode}`),
      });
    }
  }

  public get isAlive(): boolean {
    return this.alive;
  }

  public emitEvent(event: AgentRunnerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  public onEvent(listener: (event: AgentRunnerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public async sendInput(input: string): Promise<void> {
    if (this.config.onInput) {
      this.config.onInput(input);
    }
  }

  public async kill(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (!this.alive) return;
    this.alive = false;
    this.killed = true;
    this.abortController.abort();

    if (this.config.onKill) {
      this.config.onKill(signal);
    }

    this.resolveWait({
      exitCode: null,
      signal,
      error: undefined,
    });
  }

  public wait(): Promise<AgentExitResult> {
    return this.waitPromise;
  }
}

export class MockAgentRunner implements AgentRunner {
  public readonly name: string;
  private config: MockAgentRunnerOptions;
  public lastOptions?: AgentRunnerOptions;
  public lastHandle?: MockExecutionHandle;

  constructor(config: MockAgentRunnerOptions = {}) {
    this.name = config.name ?? 'mock-runner';
    this.config = config;
  }

  public setConfig(config: Partial<MockAgentRunnerOptions>): void {
    this.config = { ...this.config, ...config };
  }

  public async start(options: AgentRunnerOptions): Promise<AgentExecutionHandle> {
    this.lastOptions = options;
    const handle = new MockExecutionHandle(options, this.config);
    this.lastHandle = handle;
    return handle;
  }
}
