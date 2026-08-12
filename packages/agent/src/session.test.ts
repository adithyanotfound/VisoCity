import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentSessionManager,
  MockAgentRunner,
  AntigravityCliRunner,
  assemblePrompt,
  getSpecialistConfig,
  type AgentRunnerEvent,
} from './index.js';
import { StorageRepository } from '@visoagent/storage';
import type { GameEvent } from '@visoagent/protocol';

describe('Agent & Session Engine', () => {
  let storage: StorageRepository;
  let mockRunner: MockAgentRunner;
  let manager: AgentSessionManager;

  beforeEach(() => {
    storage = new StorageRepository({ dbPath: ':memory:' });
    mockRunner = new MockAgentRunner();
    manager = new AgentSessionManager({
      runner: mockRunner,
      storage,
      defaultModel: 'sonnet',
    });
  });

  afterEach(() => {
    storage.close();
  });

  describe('1. Session Creation & Unique IDs', () => {
    it('creates an agent session with default values and unique ID', () => {
      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Build new feature',
      });

      expect(session.id).toBeDefined();
      expect(session.id.startsWith('sess_')).toBe(true);
      expect(session.cityId).toBe('main');
      expect(session.prompt).toBe('Build new feature');
      expect(session.model).toBe('sonnet');
      expect(session.status).toBe('idle');
      expect(session.isRunning()).toBe(false);
      expect(session.isFinished()).toBe(false);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('generates distinct unique IDs for multiple sessions', () => {
      const session1 = manager.createSession({ cityId: 'main', prompt: 'p1' });
      const session2 = manager.createSession({ cityId: 'main', prompt: 'p2' });
      const session3 = manager.createSession({ cityId: 'pr-42', prompt: 'p3' });

      expect(session1.id).not.toBe(session2.id);
      expect(session2.id).not.toBe(session3.id);
      expect(session1.id).not.toBe(session3.id);
    });

    it('supports custom session options and metadata', () => {
      const session = manager.createSession({
        sessionId: 'custom_sess_001',
        cityId: 'issue-10',
        prompt: 'Refactor database queries',
        model: 'opus',
        effort: 'high',
        permissionMode: 'auto',
        contextPaths: ['src/db.ts', 'src/models.ts'],
        workingDirectory: '/tmp/test-worktree',
        metadata: { issueNumber: 10, author: 'Mayor' },
      });

      expect(session.id).toBe('custom_sess_001');
      expect(session.cityId).toBe('issue-10');
      expect(session.model).toBe('opus');
      expect(session.effort).toBe('high');
      expect(session.permissionMode).toBe('auto');
      expect(session.contextPaths).toEqual(['src/db.ts', 'src/models.ts']);
      expect(session.workingDirectory).toBe('/tmp/test-worktree');
      expect(session.metadata).toEqual({ issueNumber: 10, author: 'Mayor' });
    });
  });

  describe('2. Session States & Complete Lifecycle', () => {
    it('progresses through idle -> initializing -> running -> completed', async () => {
      const stateTransitions: string[] = [];
      const emittedEvents: GameEvent[] = [];

      const scriptedEvents: AgentRunnerEvent[] = [
        {
          type: 'text_chunk',
          payload: 'Analyzing requirements...',
          timestamp: Date.now(),
        },
        {
          type: 'tool_start',
          payload: { toolName: 'Read', input: { path: 'src/main.ts' } },
          timestamp: Date.now(),
        },
        {
          type: 'tool_end',
          payload: { toolName: 'Read', success: true, targetPath: 'src/main.ts' },
          timestamp: Date.now(),
        },
        {
          type: 'file_change',
          payload: { filePath: 'src/main.ts', changeType: 'modify' },
          timestamp: Date.now(),
        },
        {
          type: 'usage',
          payload: { costUsd: 0.04, totalSpendUsd: 0.04, budgetLimitUsd: 10 },
          timestamp: Date.now(),
        },
      ];

      mockRunner.setConfig({
        events: scriptedEvents,
        delayMs: 2,
        exitCode: 0,
      });

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Add healthcheck endpoint',
      });

      session.on('stateChange', (state) => {
        stateTransitions.push(state);
      });

      session.on('event', (ev) => {
        emittedEvents.push(ev);
      });

      expect(session.status).toBe('idle');
      expect(session.isRunning()).toBe(false);

      const startPromise = session.start();
      expect(session.isRunning()).toBe(true);

      await startPromise;

      expect(session.status).toBe('completed');
      expect(session.isRunning()).toBe(false);
      expect(session.isFinished()).toBe(true);
      expect(session.exitCode).toBe(0);
      expect(session.completedAt).toBeGreaterThan(0);
      expect(session.getDurationMs()).toBeGreaterThanOrEqual(0);

      // Verify transitions
      expect(stateTransitions).toEqual(['initializing', 'running', 'completed']);

      // Verify GameEvent sequence
      const eventTypes = emittedEvents.map((e) => e.type);
      expect(eventTypes).toEqual([
        'session.started',
        'assistant.message',
        'tool.started',
        'tool.completed',
        'file.changed',
        'session.usage',
        'session.finished',
      ]);

      const finishedEvent = emittedEvents.find((e) => e.type === 'session.finished');
      if (finishedEvent && finishedEvent.type === 'session.finished') {
        expect(finishedEvent.status).toBe('completed');
      }
    });

    it('rejects starting a session twice', async () => {
      mockRunner.setConfig({ delayMs: 10, exitCode: 0 });
      const session = manager.createSession({ cityId: 'main', prompt: 'Double start test' });

      const firstStart = session.start();
      await expect(session.start()).rejects.toThrow(/Cannot start session in status/);
      await firstStart;

      await expect(session.start()).rejects.toThrow(/Cannot start session in status: completed/);
    });
  });

  describe('3. Tracking Running Sessions', () => {
    it('tracks active running sessions across the manager', async () => {
      mockRunner.setConfig({ delayMs: 30, exitCode: 0 });

      const session1 = manager.createSession({ cityId: 'main', prompt: 'Task 1' });
      const session2 = manager.createSession({ cityId: 'pr-12', prompt: 'Task 2' });

      expect(manager.hasRunningSession()).toBe(false);
      expect(manager.getRunningSessions().length).toBe(0);

      const run1 = session1.start();
      expect(manager.hasRunningSession()).toBe(true);
      expect(manager.hasRunningSession('main')).toBe(true);
      expect(manager.hasRunningSession('pr-12')).toBe(false);
      expect(manager.getRunningSessions('main').map((s) => s.id)).toEqual([session1.id]);

      const run2 = session2.start();
      expect(manager.hasRunningSession('pr-12')).toBe(true);
      expect(manager.getRunningSessions().length).toBe(2);

      await Promise.all([run1, run2]);

      expect(manager.hasRunningSession()).toBe(false);
      expect(manager.getRunningSessions().length).toBe(0);
    });
  });

  describe('4. Detecting Failure & Process Crashes Gracefully', () => {
    it('detects non-zero exit code as a failed session', async () => {
      mockRunner.setConfig({
        events: [{ type: 'text_chunk', payload: 'Error occurred', timestamp: Date.now() }],
        delayMs: 2,
        exitCode: 1,
      });

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Trigger failure',
      });

      const finishListener = vi.fn();
      session.on('finished', finishListener);

      await session.start();

      expect(session.status).toBe('failed');
      expect(session.isFinished()).toBe(true);
      expect(session.isRunning()).toBe(false);
      expect(session.exitCode).toBe(1);
      expect(session.error).toBeDefined();

      expect(finishListener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
        }),
      );

      const lastEvent = session.getEvents().slice(-1)[0];
      expect(lastEvent.type).toBe('session.finished');
      if (lastEvent.type === 'session.finished') {
        expect(lastEvent.status).toBe('error');
      }
    });

    it('handles unexpected runner spawn errors gracefully', async () => {
      mockRunner.setConfig({
        errorToThrow: new Error('spawn agy ENOENT: command not found'),
        exitCode: 127,
      });

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Command missing test',
      });

      await session.start();

      expect(session.status).toBe('failed');
      expect(session.error).toContain('spawn agy ENOENT');
      expect(session.exitCode).toBe(127);
    });

    it('handles unexpected unhandled thrown exceptions during execution', async () => {
      const crashingRunner = {
        name: 'crashing-runner',
        start: vi.fn().mockRejectedValue(new Error('Fatal memory overflow')),
      };

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Crash test',
        runner: crashingRunner,
      });

      await session.start();

      expect(session.status).toBe('failed');
      expect(session.error).toBe('Fatal memory overflow');
      expect(session.isFinished()).toBe(true);
    });
  });

  describe('5. Cancelling a Session', () => {
    it('cancels a running session gracefully', async () => {
      let killCalledWithSignal: string | undefined;

      mockRunner.setConfig({
        hangForever: true,
        onKill: (signal) => {
          killCalledWithSignal = signal;
        },
      });

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Long running task',
      });

      const startPromise = session.start();

      // Allow session to start and enter running state
      await new Promise((r) => setTimeout(r, 10));
      expect(session.isRunning()).toBe(true);

      await session.cancel('Mayor cancelled the task');

      await startPromise;

      expect(session.status).toBe('aborted');
      expect(session.isRunning()).toBe(false);
      expect(session.isFinished()).toBe(true);
      expect(killCalledWithSignal).toBe('SIGTERM');

      const lastEvent = session.getEvents().slice(-1)[0];
      expect(lastEvent.type).toBe('session.finished');
      if (lastEvent.type === 'session.finished') {
        expect(lastEvent.status).toBe('aborted');
        expect(lastEvent.summary).toBe('Mayor cancelled the task');
      }
    });

    it('cancels session via manager.cancelSession', async () => {
      mockRunner.setConfig({ hangForever: true });

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Cancel via manager',
      });

      const startPromise = session.start();
      await new Promise((r) => setTimeout(r, 10));

      const cancelled = await manager.cancelSession(session.id, 'User clicked abort');
      expect(cancelled).toBe(true);

      await startPromise;
      expect(session.status).toBe('aborted');
    });
  });

  describe('6. Human-in-the-Loop Permit Gating', () => {
    it('transitions to waiting_for_permit on gated tool and resumes on permit approval', async () => {
      const permitId = 'permit_test_123';
      const scriptedEvents: AgentRunnerEvent[] = [
        {
          type: 'permit_request',
          payload: {
            permitId,
            toolName: 'Write',
            description: 'Write file src/config.ts',
            targetPath: 'src/config.ts',
          },
          timestamp: Date.now(),
        },
      ];

      mockRunner.setConfig({
        events: scriptedEvents,
        delayMs: 5,
        exitCode: 0,
      });

      const session = manager.createSession({
        cityId: 'main',
        prompt: 'Edit config',
        permissionMode: 'default',
      });

      let permitRequested = false;
      session.on('event', (ev) => {
        if (ev.type === 'permit.requested') {
          permitRequested = true;
          // Resolve permit shortly after request
          setTimeout(() => {
            manager.resolvePermit(permitId, 'allow');
          }, 10);
        }
      });

      await session.start();

      expect(permitRequested).toBe(true);
      expect(session.status).toBe('completed');
    });
  });

  describe('7. Persisting and Retrieving Session State', () => {
    it('persists session updates in SQLite and retrieves them across instances', async () => {
      mockRunner.setConfig({
        events: [
          { type: 'text_chunk', payload: 'Work done', timestamp: Date.now() },
          {
            type: 'usage',
            payload: { costUsd: 0.08, totalSpendUsd: 0.08 },
            timestamp: Date.now(),
          },
        ],
        delayMs: 2,
        exitCode: 0,
      });

      const session = manager.createSession({
        sessionId: 'sess_persist_test',
        cityId: 'main',
        prompt: 'Test persistence',
        model: 'sonnet',
        effort: 'high',
      });

      await session.start();

      // Create new manager with same storage instance (simulating server restart or fresh lookup)
      const freshManager = new AgentSessionManager({
        runner: mockRunner,
        storage,
      });

      const reloadedSession = freshManager.getSession('sess_persist_test');
      expect(reloadedSession).not.toBeNull();
      expect(reloadedSession?.id).toBe('sess_persist_test');
      expect(reloadedSession?.cityId).toBe('main');
      expect(reloadedSession?.status).toBe('completed');
      expect(reloadedSession?.prompt).toBe('Test persistence');
      expect(reloadedSession?.model).toBe('sonnet');
      expect(reloadedSession?.effort).toBe('high');
      expect(reloadedSession?.exitCode).toBe(0);
      expect(reloadedSession?.costUsd).toBe(0.08);

      const allSessions = freshManager.listSessions();
      expect(allSessions.length).toBe(1);
      expect(allSessions[0].id).toBe('sess_persist_test');

      const events = storage.getEvents('main', 'sess_persist_test');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('session.started');
      expect(events.slice(-1)[0].type).toBe('session.finished');
    });
  });

  describe('8. Clean Interface & Antigravity CLI Adapter', () => {
    it('formats spawn config correctly with flags for Antigravity CLI', () => {
      const runner = new AntigravityCliRunner({ executablePath: '/usr/local/bin/agy' });

      const spawnConfig = runner.buildSpawnConfig({
        sessionId: 'sess_cli_001',
        cityId: 'main',
        prompt: 'Fix the login bug',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'auto',
        contextPaths: ['src/auth.ts', 'src/user.ts'],
        workingDirectory: '/path/to/repo',
        timeoutMs: 60000,
      });

      expect(spawnConfig.command).toBe('/usr/local/bin/agy');
      expect(spawnConfig.args).toEqual([
        '-p',
        'Fix the login bug',
        '--output-format',
        'stream-json',
        '--model',
        'sonnet',
        '--effort',
        'high',
        '--dangerously-skip-permissions',
        '--conversation',
        'sess_cli_001',
        '--add-dir',
        'src/auth.ts',
        '--add-dir',
        'src/user.ts',
      ]);
      expect(spawnConfig.cwd).toBe('/path/to/repo');
      expect(spawnConfig.timeoutMs).toBe(60000);
    });

    it('maps specialist personas and prompt assembly', () => {
      const architect = getSpecialistConfig('architect');
      expect(architect.model).toBe('opus');
      expect(architect.defaultEffort).toBe('high');
      expect(architect.systemPrompt).toContain('The Architect');

      const worker = getSpecialistConfig('worker');
      expect(worker.model).toBe('sonnet');

      const runner = getSpecialistConfig('runner');
      expect(runner.model).toBe('haiku');

      const prompt = assemblePrompt({
        prompt: 'Add unit tests',
        contextPaths: ['src/session.ts'],
      });

      expect(prompt).toContain('Target context files:');
      expect(prompt).toContain('- src/session.ts');
      expect(prompt).toContain('Mayor Order:\nAdd unit tests');
    });
  });
});
