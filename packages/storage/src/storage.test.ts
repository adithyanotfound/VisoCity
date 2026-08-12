import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageRepository } from './index.js';
import type { SessionRecord, PermitRecord, SnapshotRecord } from './types.js';
import type { GameEvent } from '@visoagent/protocol';

describe('StorageRepository', () => {
  let repo: StorageRepository;

  beforeEach(() => {
    repo = new StorageRepository({ dbPath: ':memory:' });
  });

  afterEach(() => {
    repo.close();
  });

  describe('Session persistence', () => {
    it('creates and retrieves a session record', () => {
      const session: SessionRecord = {
        id: 'sess_12345',
        cityId: 'main',
        status: 'idle',
        prompt: 'Add health check',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'default',
        contextPaths: ['src/health.ts'],
        workingDirectory: '/tmp/repo',
        createdAt: 1700000000000,
        costUsd: 0.05,
        metadata: { customFlag: true },
      };

      repo.saveSession(session);

      const retrieved = repo.getSession('sess_12345');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('sess_12345');
      expect(retrieved?.cityId).toBe('main');
      expect(retrieved?.status).toBe('idle');
      expect(retrieved?.prompt).toBe('Add health check');
      expect(retrieved?.model).toBe('sonnet');
      expect(retrieved?.effort).toBe('high');
      expect(retrieved?.contextPaths).toEqual(['src/health.ts']);
      expect(retrieved?.metadata).toEqual({ customFlag: true });
    });

    it('updates an existing session record', () => {
      const session: SessionRecord = {
        id: 'sess_update_test',
        cityId: 'main',
        status: 'running',
        prompt: 'Fix bug',
        model: 'opus',
        createdAt: 1700000000000,
        startedAt: 1700000001000,
      };

      repo.saveSession(session);

      const updated = repo.updateSession('sess_update_test', {
        status: 'completed',
        completedAt: 1700000005000,
        exitCode: 0,
        costUsd: 0.12,
      });

      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBe(1700000005000);
      expect(updated?.exitCode).toBe(0);
      expect(updated?.costUsd).toBe(0.12);

      const reloaded = repo.getSession('sess_update_test');
      expect(reloaded?.status).toBe('completed');
    });

    it('lists sessions with filters', () => {
      repo.saveSession({
        id: 'sess_1',
        cityId: 'city_a',
        status: 'running',
        prompt: 'p1',
        model: 'sonnet',
        createdAt: 1000,
      });
      repo.saveSession({
        id: 'sess_2',
        cityId: 'city_a',
        status: 'completed',
        prompt: 'p2',
        model: 'sonnet',
        createdAt: 2000,
      });
      repo.saveSession({
        id: 'sess_3',
        cityId: 'city_b',
        status: 'running',
        prompt: 'p3',
        model: 'sonnet',
        createdAt: 3000,
      });

      const all = repo.listSessions();
      expect(all.length).toBe(3);

      const cityA = repo.listSessions({ cityId: 'city_a' });
      expect(cityA.length).toBe(2);

      const runningInCityA = repo.listSessions({ cityId: 'city_a', status: 'running' });
      expect(runningInCityA.length).toBe(1);
      expect(runningInCityA[0].id).toBe('sess_1');
    });

    it('deletes a session', () => {
      repo.saveSession({
        id: 'sess_to_delete',
        cityId: 'main',
        status: 'idle',
        prompt: 'Test delete',
        model: 'sonnet',
        createdAt: 1000,
      });

      expect(repo.getSession('sess_to_delete')).not.toBeNull();
      const deleted = repo.deleteSession('sess_to_delete');
      expect(deleted).toBe(true);
      expect(repo.getSession('sess_to_delete')).toBeNull();
    });
  });

  describe('Event log persistence', () => {
    it('records and retrieves game events chronologically', () => {
      const event1: GameEvent = {
        type: 'session.started',
        cityId: 'main',
        sessionId: 'sess_ev_1',
        timestamp: 1700000000,
      };

      const event2: GameEvent = {
        type: 'assistant.message',
        cityId: 'main',
        textChunk: 'Hello Mayor!',
      };

      const event3: GameEvent = {
        type: 'tool.completed',
        cityId: 'main',
        toolName: 'Write',
        targetPath: 'src/app.ts',
        success: true,
      };

      repo.recordEvent('main', 'sess_ev_1', event1);
      repo.recordEvent('main', 'sess_ev_1', event2);
      repo.recordEvent('main', 'sess_ev_1', event3);

      const events = repo.getEvents('main', 'sess_ev_1');
      expect(events.length).toBe(3);
      expect(events[0].type).toBe('session.started');
      expect(events[1].type).toBe('assistant.message');
      expect(events[2].type).toBe('tool.completed');
    });
  });

  describe('Permits persistence', () => {
    it('saves and updates permits', () => {
      const permit: PermitRecord = {
        permitId: 'permit_001',
        cityId: 'main',
        sessionId: 'sess_1',
        toolName: 'Write',
        targetPath: 'src/main.ts',
        description: 'Edit main file',
        status: 'pending',
        createdAt: 1000,
      };

      repo.savePermit(permit);
      expect(repo.getPermit('permit_001')?.status).toBe('pending');

      repo.updatePermit('permit_001', {
        status: 'allowed',
        resolvedAt: 1050,
      });

      const updated = repo.getPermit('permit_001');
      expect(updated?.status).toBe('allowed');
      expect(updated?.resolvedAt).toBe(1050);
    });
  });

  describe('Snapshots persistence', () => {
    it('saves and retrieves world snapshots', () => {
      const snapshotRecord: SnapshotRecord = {
        cityId: 'main',
        repoName: 'visoagent',
        commitSha: 'a1b2c3d',
        totalLoc: 500,
        snapshot: {
          cityId: 'main',
          repoName: 'visoagent',
          commitSha: 'a1b2c3d',
          totalLoc: 500,
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
          districts: [],
          buildings: [],
          roads: [],
        },
        updatedAt: 1700000000,
      };

      repo.saveSnapshot(snapshotRecord);

      const retrieved = repo.getSnapshot('main');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.repoName).toBe('visoagent');
      expect(retrieved?.commitSha).toBe('a1b2c3d');
      expect(retrieved?.totalLoc).toBe(500);
      expect(retrieved?.snapshot.bounds.maxX).toBe(10);
    });
  });
});
