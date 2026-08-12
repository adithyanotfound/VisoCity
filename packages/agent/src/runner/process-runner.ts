import { spawn, type ChildProcess } from 'node:child_process';
import type {
  AgentExecutionHandle,
  AgentExitResult,
  AgentRunner,
  AgentRunnerEvent,
  AgentRunnerOptions,
} from '../types.js';

export interface ProcessSpawnConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export class ProcessExecutionHandle implements AgentExecutionHandle {
  public readonly pid?: number;
  private child: ChildProcess;
  private eventListeners: Set<(event: AgentRunnerEvent) => void> = new Set();
  private waitPromise: Promise<AgentExitResult>;
  private alive = true;
  private killed = false;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private timeoutTimer?: NodeJS.Timeout;

  constructor(
    child: ChildProcess,
    timeoutMs?: number,
    onLine?: (line: string, handle: ProcessExecutionHandle) => void,
  ) {
    this.child = child;
    this.pid = child.pid;

    if (timeoutMs && timeoutMs > 0) {
      this.timeoutTimer = setTimeout(() => {
        if (this.alive) {
          this.emitEvent({
            type: 'error',
            payload: `Execution timed out after ${timeoutMs}ms`,
            timestamp: Date.now(),
          });
          this.kill('SIGKILL').catch(() => {});
        }
      }, timeoutMs);
    }

    this.waitPromise = new Promise<AgentExitResult>((resolve) => {
      let stdoutAcc = '';
      let stderrAcc = '';

      if (child.stdout) {
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => {
          stdoutAcc += chunk;
          this.stdoutBuffer += chunk;

          // Parse line by line if onLine handler provided
          if (onLine) {
            const lines = this.stdoutBuffer.split('\n');
            this.stdoutBuffer = lines.pop() ?? ''; // keep trailing incomplete chunk
            for (const line of lines) {
              if (line.trim().length > 0) {
                onLine(line, this);
              }
            }
          } else {
            this.emitEvent({
              type: 'raw_stdout',
              payload: chunk,
              timestamp: Date.now(),
            });
          }
        });
      }

      if (child.stderr) {
        child.stderr.setEncoding('utf-8');
        child.stderr.on('data', (chunk: string) => {
          stderrAcc += chunk;
          this.stderrBuffer += chunk;
          this.emitEvent({
            type: 'raw_stderr',
            payload: chunk,
            timestamp: Date.now(),
          });
        });
      }

      child.on('error', (err: Error) => {
        this.alive = false;
        if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
        this.emitEvent({
          type: 'error',
          payload: err.message,
          timestamp: Date.now(),
        });
        resolve({
          exitCode: 1,
          error: err,
          rawOutput: stdoutAcc + '\n' + stderrAcc,
        });
      });

      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        this.alive = false;
        if (this.timeoutTimer) clearTimeout(this.timeoutTimer);

        // Flush any remaining stdout line
        if (onLine && this.stdoutBuffer.trim().length > 0) {
          onLine(this.stdoutBuffer, this);
          this.stdoutBuffer = '';
        }

        const isSuccess = code === 0 && !signal && !this.killed;
        let error: Error | undefined;

        if (!isSuccess && !this.killed) {
          const errDetail =
            stderrAcc.trim() ||
            `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}`;
          error = new Error(errDetail);
        }

        resolve({
          exitCode: code,
          signal,
          error,
          rawOutput: stdoutAcc + '\n' + stderrAcc,
        });
      });
    });
  }

  public get isAlive(): boolean {
    return this.alive;
  }

  public emitEvent(event: AgentRunnerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Listener errors shouldn't crash stream
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
    if (!this.alive || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error('Process stdin is not writable');
    }
    return new Promise<void>((resolve, reject) => {
      this.child.stdin?.write(input + '\n', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async kill(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (!this.alive) {
      return;
    }
    this.killed = true;

    try {
      this.child.kill(signal);
    } catch {
      // Process may already be dead
    }

    // Give process 1000ms to exit gracefully, then force SIGKILL
    const forceKillTimer = setTimeout(() => {
      if (this.alive) {
        try {
          this.child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }, 1000);

    try {
      await this.waitPromise;
    } finally {
      clearTimeout(forceKillTimer);
    }
  }

  public wait(): Promise<AgentExitResult> {
    return this.waitPromise;
  }
}

export abstract class ProcessAgentRunner implements AgentRunner {
  public abstract readonly name: string;

  public abstract buildSpawnConfig(options: AgentRunnerOptions): ProcessSpawnConfig;

  protected handleLine?(line: string, handle: ProcessExecutionHandle): void;

  public async start(options: AgentRunnerOptions): Promise<AgentExecutionHandle> {
    const config = this.buildSpawnConfig(options);

    const child = spawn(config.command, config.args, {
      cwd: config.cwd ?? options.workingDirectory ?? process.cwd(),
      env: {
        ...process.env,
        ...(config.env ?? options.env ?? {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const handle = new ProcessExecutionHandle(
      child,
      config.timeoutMs ?? options.timeoutMs,
      this.handleLine ? (line, h) => this.handleLine!(line, h) : undefined,
    );

    return handle;
  }
}
