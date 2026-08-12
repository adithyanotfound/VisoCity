import { describe, it, expect, beforeEach } from 'vitest';
import { Task, TaskSchema } from '@visoagent/protocol';
import { InMemoryTaskRepository } from './repositories/in-memory-task-repository.js';
import { SqliteTaskRepository } from './repositories/sqlite-task-repository.js';
import { createDatabase } from './sqlite/db.js';
import { ITaskRepository } from './types.js';

describe('Task Repositories', () => {
  const createSampleTask = (id: string, overrides: Partial<Task> = {}): Task => {
    const now = new Date().toISOString();
    return TaskSchema.parse({
      id,
      title: `Task Title ${id}`,
      description: `Description for ${id}`,
      status: 'queued',
      agent: {
        agentId: 'agent-1',
        sessionId: 'session-1',
      },
      branch: {
        name: 'feat/test',
        targetBranch: 'main',
      },
      worktree: {
        path: '.visocity/worktrees/issue-1',
        isDetached: true,
      },
      pullRequest: {
        number: 101,
        title: 'PR 101',
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
      metadata: { key: 'value' },
      history: [
        {
          id: `h-${id}-1`,
          fromStatus: null,
          toStatus: 'queued',
          timestamp: now,
          actor: 'user',
          reason: 'Initial creation',
        },
      ],
      ...overrides,
    });
  };

  const runRepositoryTestSuite = (name: string, getRepo: () => ITaskRepository) => {
    describe(name, () => {
      let repo: ITaskRepository;

      beforeEach(() => {
        repo = getRepo();
      });

      it('creates and finds a task by ID', async () => {
        const task = createSampleTask('task-create-1');
        const created = await repo.create(task);
        expect(created.id).toBe('task-create-1');

        const found = await repo.findById('task-create-1');
        expect(found).not.toBeNull();
        expect(found?.title).toBe('Task Title task-create-1');
        expect(found?.status).toBe('queued');
        expect(found?.agent?.agentId).toBe('agent-1');
        expect(found?.branch?.name).toBe('feat/test');
        expect(found?.worktree?.path).toBe('.visocity/worktrees/issue-1');
        expect(found?.pullRequest?.number).toBe(101);
        expect(found?.history.length).toBe(1);
      });

      it('returns null for non-existent task ID', async () => {
        const found = await repo.findById('non-existent');
        expect(found).toBeNull();
      });

      it('updates an existing task', async () => {
        const task = createSampleTask('task-update-1');
        await repo.create(task);

        const updatedTask = {
          ...task,
          title: 'Updated Title',
          status: 'in_progress' as const,
        };

        const result = await repo.update(updatedTask);
        expect(result.title).toBe('Updated Title');
        expect(result.status).toBe('in_progress');

        const reloaded = await repo.findById('task-update-1');
        expect(reloaded?.title).toBe('Updated Title');
        expect(reloaded?.status).toBe('in_progress');
      });

      it('deletes a task by ID', async () => {
        const task = createSampleTask('task-delete-1');
        await repo.create(task);

        const deleted = await repo.delete('task-delete-1');
        expect(deleted).toBe(true);

        const found = await repo.findById('task-delete-1');
        expect(found).toBeNull();
      });

      it('adds and retrieves history entries', async () => {
        const task = createSampleTask('task-hist-1');
        await repo.create(task);

        const newEntry = {
          id: 'hist-2',
          fromStatus: 'queued' as const,
          toStatus: 'assigned' as const,
          timestamp: new Date().toISOString(),
          actor: 'mayor',
          reason: 'Assigned worker',
        };

        await repo.addHistoryEntry('task-hist-1', newEntry);

        const history = await repo.getHistory('task-hist-1');
        expect(history.length).toBe(2);
        expect(history[1].toStatus).toBe('assigned');
        expect(history[1].actor).toBe('mayor');

        const reloaded = await repo.findById('task-hist-1');
        expect(reloaded?.history.length).toBe(2);
      });

      it('filters tasks by status, agentId, sessionId, branch, and PR', async () => {
        const t1 = createSampleTask('t1', {
          status: 'queued',
          agent: { agentId: 'agent-A', sessionId: 'sess-1' },
          branch: { name: 'branch-1' },
          pullRequest: { number: 10 },
        });
        const t2 = createSampleTask('t2', {
          status: 'in_progress',
          agent: { agentId: 'agent-A', sessionId: 'sess-1' },
          branch: { name: 'branch-2' },
          pullRequest: { number: 20 },
        });
        const t3 = createSampleTask('t3', {
          status: 'approved',
          agent: { agentId: 'agent-B', sessionId: 'sess-2' },
          branch: { name: 'branch-3' },
          pullRequest: { number: 30 },
        });

        await repo.create(t1);
        await repo.create(t2);
        await repo.create(t3);

        const queuedOnly = await repo.list({ status: 'queued' });
        expect(queuedOnly.length).toBe(1);
        expect(queuedOnly[0].id).toBe('t1');

        const multiStatus = await repo.list({ status: ['queued', 'approved'] });
        expect(multiStatus.length).toBe(2);

        const byAgent = await repo.list({ agentId: 'agent-A' });
        expect(byAgent.length).toBe(2);

        const bySession = await repo.list({ sessionId: 'sess-2' });
        expect(bySession.length).toBe(1);
        expect(bySession[0].id).toBe('t3');

        const byBranch = await repo.list({ branchName: 'branch-2' });
        expect(byBranch.length).toBe(1);
        expect(byBranch[0].id).toBe('t2');

        const byPr = await repo.list({ prNumber: 30 });
        expect(byPr.length).toBe(1);
        expect(byPr[0].id).toBe('t3');

        const count = await repo.count({ agentId: 'agent-A' });
        expect(count).toBe(2);
      });

      it('searches tasks by query across title and description', async () => {
        const t1 = createSampleTask('search-1', {
          title: 'Implement OAuth Token Refresh',
          description: 'Handle token expiration',
        });
        const t2 = createSampleTask('search-2', {
          title: 'Fix UI Scaffold Animation',
          description: 'Improve isometric crane rendering',
        });
        const t3 = createSampleTask('search-3', {
          title: 'Database migration',
          description: 'OAuth schema upgrade',
        });

        await repo.create(t1);
        await repo.create(t2);
        await repo.create(t3);

        const searchOAuth = await repo.list({ query: 'oauth' });
        expect(searchOAuth.length).toBe(2);

        const searchCrane = await repo.list({ query: 'crane' });
        expect(searchCrane.length).toBe(1);
        expect(searchCrane[0].id).toBe('search-2');
      });

      it('supports pagination with limit and offset', async () => {
        for (let i = 1; i <= 5; i++) {
          const t = createSampleTask(`page-${i}`, {
            title: `Page Task ${i}`,
            timestamps: {
              createdAt: new Date(2026, 0, i).toISOString(),
              updatedAt: new Date(2026, 0, i).toISOString(),
            },
          });
          await repo.create(t);
        }

        const page1 = await repo.list({
          sortBy: 'createdAt',
          sortDirection: 'asc',
          limit: 2,
          offset: 0,
        });
        expect(page1.length).toBe(2);
        expect(page1[0].id).toBe('page-1');
        expect(page1[1].id).toBe('page-2');

        const page2 = await repo.list({
          sortBy: 'createdAt',
          sortDirection: 'asc',
          limit: 2,
          offset: 2,
        });
        expect(page2.length).toBe(2);
        expect(page2[0].id).toBe('page-3');
        expect(page2[1].id).toBe('page-4');
      });
    });
  };

  runRepositoryTestSuite('InMemoryTaskRepository', () => new InMemoryTaskRepository());

  runRepositoryTestSuite('SqliteTaskRepository (In-Memory SQLite)', () => {
    const db = createDatabase({ inMemory: true });
    return new SqliteTaskRepository(db);
  });
});
