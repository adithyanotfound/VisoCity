import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type { GameEvent } from '@visoagent/protocol';
import type { StorageRepository } from '@visoagent/storage';
import type { AgentRunner, CreateSessionOptions, SessionRecord, SessionStatus } from './types.js';
import { AgentSession } from './session.js';
import { PermissionGatekeeper } from './permissions.js';
import { AntigravityCliRunner } from './runner/antigravity.js';

export interface AgentSessionManagerOptions {
  runner?: AgentRunner;
  storage?: StorageRepository;
  gatekeeper?: PermissionGatekeeper;
  defaultModel?: string;
  workingDirectory?: string;
}

export class AgentSessionManager extends EventEmitter {
  private activeSessions = new Map<string, AgentSession>();
  private runner: AgentRunner;
  private storage?: StorageRepository;
  private gatekeeper: PermissionGatekeeper;
  private defaultModel: string;
  private workingDirectory?: string;

  constructor(options: AgentSessionManagerOptions = {}) {
    super();
    this.runner = options.runner ?? new AntigravityCliRunner();
    this.storage = options.storage;
    this.gatekeeper = options.gatekeeper ?? new PermissionGatekeeper({ storage: this.storage });
    this.defaultModel = options.defaultModel ?? 'sonnet';
    this.workingDirectory = options.workingDirectory;
  }

  public getRunner(): AgentRunner {
    return this.runner;
  }

  public setRunner(runner: AgentRunner): void {
    this.runner = runner;
  }

  public getStorage(): StorageRepository | undefined {
    return this.storage;
  }

  public getGatekeeper(): PermissionGatekeeper {
    return this.gatekeeper;
  }

  // ==========================================
  // Session Creation & Retrieval
  // ==========================================

  public createSession(options: CreateSessionOptions): AgentSession {
    const sessionId = options.sessionId ?? `sess_${crypto.randomUUID()}`;

    const session = new AgentSession({
      sessionId,
      cityId: options.cityId,
      prompt: options.prompt,
      model: options.model ?? this.defaultModel,
      effort: options.effort,
      permissionMode: options.permissionMode ?? 'default',
      contextPaths: options.contextPaths,
      workingDirectory: options.workingDirectory ?? this.workingDirectory,
      timeoutMs: options.timeoutMs,
      metadata: options.metadata,
      runner: options.runner ?? this.runner,
      storage: this.storage,
      gatekeeper: this.gatekeeper,
    });

    this.attachSessionListeners(session);
    this.activeSessions.set(sessionId, session);

    if (this.storage) {
      this.storage.saveSession(session.toRecord());
    }

    return session;
  }

  public getSession(sessionId: string): AgentSession | null {
    // 1. Check in-memory active sessions
    const active = this.activeSessions.get(sessionId);
    if (active) {
      return active;
    }

    // 2. Try loading from storage
    if (this.storage) {
      const stored = this.storage.getSession(sessionId);
      if (stored) {
        return this.reconstructSessionFromRecord(stored);
      }
    }

    return null;
  }

  public listSessions(filter?: { cityId?: string; status?: SessionStatus }): AgentSession[] {
    const sessionMap = new Map<string, AgentSession>();

    // Add stored sessions first
    if (this.storage) {
      const storedRecords = this.storage.listSessions(filter);
      for (const record of storedRecords) {
        const reconstructed = this.reconstructSessionFromRecord(record);
        sessionMap.set(record.id, reconstructed);
      }
    }

    // Override with in-memory active sessions (which have live state)
    for (const [id, session] of this.activeSessions.entries()) {
      if (filter?.cityId && session.cityId !== filter.cityId) continue;
      if (filter?.status && session.status !== filter.status) continue;
      sessionMap.set(id, session);
    }

    return Array.from(sessionMap.values());
  }

  public getRunningSessions(cityId?: string): AgentSession[] {
    const running: AgentSession[] = [];
    for (const session of this.activeSessions.values()) {
      if (session.isRunning()) {
        if (!cityId || session.cityId === cityId) {
          running.push(session);
        }
      }
    }
    return running;
  }

  public hasRunningSession(cityId?: string): boolean {
    return this.getRunningSessions(cityId).length > 0;
  }

  public async cancelSession(sessionId: string, reason?: string): Promise<boolean> {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }
    await session.cancel(reason);
    return true;
  }

  public resolvePermit(permitId: string, decision: 'allow' | 'deny', reason?: string): boolean {
    // Check gatekeeper
    const success = this.gatekeeper.resolvePermit(permitId, decision, reason);

    // Also notify active sessions
    for (const session of this.activeSessions.values()) {
      if (session.status === 'waiting_for_permit') {
        session.resolvePermit(permitId, decision, reason);
      }
    }

    return success;
  }

  public deleteSession(sessionId: string): boolean {
    this.activeSessions.delete(sessionId);
    if (this.storage) {
      return this.storage.deleteSession(sessionId);
    }
    return true;
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  public onSessionEvent(listener: (sessionId: string, event: GameEvent) => void): () => void {
    const handler = (sessionId: string, event: GameEvent) => {
      listener(sessionId, event);
    };
    this.on('sessionEvent', handler);
    return () => {
      this.off('sessionEvent', handler);
    };
  }

  public onSessionStateChange(
    listener: (sessionId: string, state: SessionStatus, prevState: SessionStatus) => void,
  ): () => void {
    const handler = (sessionId: string, state: SessionStatus, prevState: SessionStatus) => {
      listener(sessionId, state, prevState);
    };
    this.on('sessionStateChange', handler);
    return () => {
      this.off('sessionStateChange', handler);
    };
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private attachSessionListeners(session: AgentSession): void {
    session.on('event', (event: GameEvent) => {
      this.emit('sessionEvent', session.id, event);
    });

    session.on('stateChange', (state: SessionStatus, prevState: SessionStatus) => {
      this.emit('sessionStateChange', session.id, state, prevState);
    });

    session.on('finished', () => {
      // Keep completed sessions accessible
    });
  }

  private reconstructSessionFromRecord(record: SessionRecord): AgentSession {
    const session = new AgentSession({
      sessionId: record.id,
      cityId: record.cityId,
      prompt: record.prompt,
      model: record.model,
      effort: record.effort,
      permissionMode: record.permissionMode,
      contextPaths: record.contextPaths,
      workingDirectory: record.workingDirectory,
      metadata: record.metadata,
      runner: this.runner,
      storage: this.storage,
      gatekeeper: this.gatekeeper,
    });

    // Replay recorded events from storage if available
    if (this.storage) {
      const storedEvents = this.storage.getEvents(record.cityId, record.id);
      for (const ev of storedEvents) {
        session.getEvents().push(ev);
      }
    }

    // Set internal state to match persisted record
    Object.assign(session, {
      _status: record.status,
      _startedAt: record.startedAt,
      _completedAt: record.completedAt,
      _error: record.error,
      _exitCode: record.exitCode,
      _costUsd: record.costUsd ?? 0.0,
      createdAt: record.createdAt,
    });

    return session;
  }
}
