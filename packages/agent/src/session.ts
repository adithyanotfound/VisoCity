import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { GameEvent } from '@visoagent/protocol';
import type { StorageRepository } from '@visoagent/storage';
import type {
  AgentExecutionHandle,
  AgentRunner,
  AgentRunnerEvent,
  CreateSessionOptions,
  FileChangePayload,
  PermissionMode,
  PermitRequestPayload,
  ReasoningEffort,
  SessionFinishedPayload,
  SessionRecord,
  SessionStatus,
  ToolEndPayload,
  ToolStartPayload,
  UsagePayload,
} from './types.js';
import { PermissionGatekeeper } from './permissions.js';
import { AntigravityCliRunner } from './runner/antigravity.js';

export interface AgentSessionOptions extends CreateSessionOptions {
  storage?: StorageRepository;
  gatekeeper?: PermissionGatekeeper;
}

export class AgentSession extends EventEmitter {
  public readonly id: string;
  public readonly cityId: string;
  public readonly prompt: string;
  public readonly model: string;
  public readonly effort?: ReasoningEffort;
  public readonly permissionMode: PermissionMode;
  public readonly contextPaths: string[];
  public readonly workingDirectory?: string;
  public readonly timeoutMs?: number;
  public readonly createdAt: number;
  public readonly metadata?: Record<string, unknown>;

  private _status: SessionStatus = 'idle';
  private _startedAt?: number;
  private _completedAt?: number;
  private _error?: string;
  private _exitCode?: number | null;
  private _costUsd = 0.0;
  private _totalSpendUsd = 0.0;
  private _events: GameEvent[] = [];

  private runner: AgentRunner;
  private storage?: StorageRepository;
  private gatekeeper: PermissionGatekeeper;
  private currentHandle?: AgentExecutionHandle;
  private unsubscribeRunnerEvents?: () => void;
  private isCancelling = false;

  constructor(options: AgentSessionOptions) {
    super();
    this.id = options.sessionId ?? `sess_${crypto.randomUUID()}`;
    this.cityId = options.cityId;
    this.prompt = options.prompt;
    this.model = options.model ?? 'sonnet';
    this.effort = options.effort;
    this.permissionMode = options.permissionMode ?? 'default';
    this.contextPaths = options.contextPaths ?? [];
    this.workingDirectory = options.workingDirectory;
    this.timeoutMs = options.timeoutMs;
    this.metadata = options.metadata;
    this.createdAt = Date.now();

    this.runner = options.runner ?? new AntigravityCliRunner();
    this.storage = options.storage;
    this.gatekeeper = options.gatekeeper ?? new PermissionGatekeeper({ storage: this.storage });
  }

  // ==========================================
  // State Accessors
  // ==========================================

  public get status(): SessionStatus {
    return this._status;
  }

  public get startedAt(): number | undefined {
    return this._startedAt;
  }

  public get completedAt(): number | undefined {
    return this._completedAt;
  }

  public get error(): string | undefined {
    return this._error;
  }

  public get exitCode(): number | null | undefined {
    return this._exitCode;
  }

  public get costUsd(): number {
    return this._costUsd;
  }

  public get totalSpendUsd(): number {
    return this._totalSpendUsd;
  }

  public getState(): SessionStatus {
    return this._status;
  }

  public isRunning(): boolean {
    return (
      this._status === 'initializing' ||
      this._status === 'running' ||
      this._status === 'waiting_for_permit'
    );
  }

  public isFinished(): boolean {
    return this._status === 'completed' || this._status === 'failed' || this._status === 'aborted';
  }

  public getDurationMs(): number {
    if (!this._startedAt) return 0;
    const end = this._completedAt ?? Date.now();
    return Math.max(0, end - this._startedAt);
  }

  public getEvents(): GameEvent[] {
    return [...this._events];
  }

  public toRecord(): SessionRecord {
    return {
      id: this.id,
      cityId: this.cityId,
      status: this._status,
      prompt: this.prompt,
      model: this.model,
      effort: this.effort,
      permissionMode: this.permissionMode,
      contextPaths: this.contextPaths,
      workingDirectory: this.workingDirectory,
      createdAt: this.createdAt,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      error: this._error,
      exitCode: this._exitCode,
      costUsd: this._costUsd,
      metadata: this.metadata,
    };
  }

  // ==========================================
  // Lifecycle Execution
  // ==========================================

  public async start(): Promise<void> {
    if (this._status !== 'idle') {
      throw new Error(`Cannot start session in status: ${this._status}`);
    }

    this.transitionState('initializing');
    this._startedAt = Date.now();

    const startEvent: GameEvent = {
      type: 'session.started',
      cityId: this.cityId,
      sessionId: this.id,
      timestamp: this._startedAt,
    };
    this.recordAndEmitEvent(startEvent);
    this.persistState();

    try {
      this.transitionState('running');

      this.currentHandle = await this.runner.start({
        sessionId: this.id,
        cityId: this.cityId,
        prompt: this.prompt,
        model: this.model,
        effort: this.effort,
        permissionMode: this.permissionMode,
        contextPaths: this.contextPaths,
        workingDirectory: this.workingDirectory,
        timeoutMs: this.timeoutMs,
      });

      this.unsubscribeRunnerEvents = this.currentHandle.onEvent((event: AgentRunnerEvent) => {
        this.handleRunnerEvent(event);
      });

      const exitResult = await this.currentHandle.wait();

      if (this.isCancelling || (this.status as SessionStatus) === 'aborted') {
        // Already handled in cancel()
        return;
      }

      this._completedAt = Date.now();
      this._exitCode = exitResult.exitCode;

      if (exitResult.exitCode === 0 && !exitResult.error) {
        this.transitionState('completed');
        const finishEvent: GameEvent = {
          type: 'session.finished',
          cityId: this.cityId,
          status: 'completed',
          summary: 'Session completed successfully',
        };
        this.recordAndEmitEvent(finishEvent);
        this.emit('finished', {
          status: 'completed',
          summary: 'Session completed successfully',
          exitCode: 0,
        } satisfies SessionFinishedPayload);
      } else {
        const errorMsg =
          exitResult.error?.message ??
          `Process failed with exit code ${exitResult.exitCode ?? 'unknown'}`;
        this._error = errorMsg;
        this.transitionState('failed');
        const finishEvent: GameEvent = {
          type: 'session.finished',
          cityId: this.cityId,
          status: 'error',
          summary: errorMsg,
        };
        this.recordAndEmitEvent(finishEvent);
        this.emit('finished', {
          status: 'error',
          summary: errorMsg,
          error: exitResult.error ?? new Error(errorMsg),
          exitCode: exitResult.exitCode,
        } satisfies SessionFinishedPayload);
      }
    } catch (err: unknown) {
      if (this.isCancelling || (this.status as SessionStatus) === 'aborted') {
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      this._completedAt = Date.now();
      this._error = error.message;
      this.transitionState('failed');

      const finishEvent: GameEvent = {
        type: 'session.finished',
        cityId: this.cityId,
        status: 'error',
        summary: error.message,
      };
      this.recordAndEmitEvent(finishEvent);
      this.emit('finished', {
        status: 'error',
        summary: error.message,
        error,
      } satisfies SessionFinishedPayload);
    } finally {
      if (this.unsubscribeRunnerEvents) {
        this.unsubscribeRunnerEvents();
        this.unsubscribeRunnerEvents = undefined;
      }
      this.currentHandle = undefined;
      this.gatekeeper.clearSessionPermits(this.id);
      this.persistState();
    }
  }

  public async cancel(reason?: string): Promise<void> {
    if (!this.isRunning() && this._status !== 'idle') {
      return;
    }

    this.isCancelling = true;
    this._completedAt = Date.now();
    this._error = reason ?? 'Session cancelled by Mayor';

    this.transitionState('aborted');

    if (this.currentHandle && this.currentHandle.isAlive) {
      try {
        await this.currentHandle.kill('SIGTERM');
      } catch {
        // Handle might already be terminated
      }
    }

    this.gatekeeper.clearSessionPermits(this.id);

    const finishEvent: GameEvent = {
      type: 'session.finished',
      cityId: this.cityId,
      status: 'aborted',
      summary: reason ?? 'Session cancelled by Mayor',
    };
    this.recordAndEmitEvent(finishEvent);
    this.emit('finished', {
      status: 'aborted',
      summary: reason ?? 'Session cancelled by Mayor',
    } satisfies SessionFinishedPayload);

    this.persistState();
  }

  public resolvePermit(permitId: string, decision: 'allow' | 'deny', reason?: string): boolean {
    const success = this.gatekeeper.resolvePermit(permitId, decision, reason);
    if (success && this._status === 'waiting_for_permit') {
      this.transitionState('running');
      this.persistState();
    }
    return success;
  }

  // ==========================================
  // Internal Event & State Handlers
  // ==========================================

  private handleRunnerEvent(event: AgentRunnerEvent): void {
    switch (event.type) {
      case 'text_chunk': {
        const textChunk = typeof event.payload === 'string' ? event.payload : String(event.payload);
        const gameEvent: GameEvent = {
          type: 'assistant.message',
          cityId: this.cityId,
          textChunk,
        };
        this.recordAndEmitEvent(gameEvent);
        break;
      }

      case 'tool_start': {
        const payload = event.payload as ToolStartPayload;
        const gameEvent: GameEvent = {
          type: 'tool.started',
          cityId: this.cityId,
          toolName: payload.toolName,
          targetPath: payload.targetPath,
          input: payload.input,
        };
        this.recordAndEmitEvent(gameEvent);
        break;
      }

      case 'tool_end': {
        const payload = event.payload as ToolEndPayload;
        const gameEvent: GameEvent = {
          type: 'tool.completed',
          cityId: this.cityId,
          toolName: payload.toolName,
          targetPath: payload.targetPath,
          success: payload.success,
        };
        this.recordAndEmitEvent(gameEvent);
        break;
      }

      case 'file_change': {
        const payload = event.payload as FileChangePayload;
        const gameEvent: GameEvent = {
          type: 'file.changed',
          cityId: this.cityId,
          filePath: payload.filePath,
          changeType: payload.changeType,
        };
        this.recordAndEmitEvent(gameEvent);
        break;
      }

      case 'permit_request': {
        const payload = event.payload as PermitRequestPayload;
        if (this.permissionMode === 'default') {
          this.transitionState('waiting_for_permit');
          this.persistState();
        }

        const gameEvent: GameEvent = {
          type: 'permit.requested',
          cityId: this.cityId,
          permitId: payload.permitId,
          toolName: payload.toolName,
          description: payload.description,
          targetPath: payload.targetPath,
        };
        this.recordAndEmitEvent(gameEvent);
        break;
      }

      case 'usage': {
        const payload = event.payload as UsagePayload;
        this._costUsd = payload.costUsd;
        this._totalSpendUsd = payload.totalSpendUsd;

        const gameEvent: GameEvent = {
          type: 'session.usage',
          cityId: this.cityId,
          costUsd: payload.costUsd,
          totalSpendUsd: payload.totalSpendUsd,
          budgetLimitUsd: payload.budgetLimitUsd ?? 10.0,
        };
        this.recordAndEmitEvent(gameEvent);
        this.persistState();
        break;
      }

      case 'error': {
        const errorMsg =
          typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
        this._error = errorMsg;
        break;
      }
    }
  }

  private transitionState(newState: SessionStatus): void {
    if (this._status === newState) return;
    const prevState = this._status;
    this._status = newState;
    this.emit('stateChange', newState, prevState);
  }

  private recordAndEmitEvent(event: GameEvent): void {
    this._events.push(event);
    if (this.storage) {
      this.storage.recordEvent(this.cityId, this.id, event);
    }
    this.emit('event', event);
  }

  private persistState(): void {
    if (this.storage) {
      this.storage.saveSession(this.toRecord());
    }
  }
}
