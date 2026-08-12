import { describe, it, expect } from 'vitest';
import {
  TaskSchema,
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  TransitionTaskInputSchema,
  TaskFilterSchema,
  normalizeTaskStatus,
  Task,
} from './index.js';

describe('Task Schemas and Normalization', () => {
  describe('normalizeTaskStatus', () => {
    it('normalizes string variants with spaces or hyphens', () => {
      expect(normalizeTaskStatus('in progress')).toBe('in_progress');
      expect(normalizeTaskStatus('in-progress')).toBe('in_progress');
      expect(normalizeTaskStatus('IN_PROGRESS')).toBe('in_progress');
      expect(normalizeTaskStatus('awaiting review')).toBe('awaiting_review');
      expect(normalizeTaskStatus('ready to merge')).toBe('ready_to_merge');
      expect(normalizeTaskStatus('QUEUED')).toBe('queued');
      expect(normalizeTaskStatus('assigned')).toBe('assigned');
      expect(normalizeTaskStatus('approved')).toBe('approved');
      expect(normalizeTaskStatus('merged')).toBe('merged');
      expect(normalizeTaskStatus('failed')).toBe('failed');
    });

    it('throws on invalid status names', () => {
      expect(() => normalizeTaskStatus('invalid_status')).toThrow(/Invalid task status/);
      expect(() => normalizeTaskStatus('')).toThrow(/Invalid task status/);
    });
  });

  describe('TaskSchema', () => {
    it('validates a complete task model structure', () => {
      const now = new Date().toISOString();
      const validTask: Task = {
        id: 'task-123',
        title: 'Implement OAuth login flow',
        description: 'Set up GitHub App OAuth and session management',
        status: 'in_progress',
        agent: {
          agentId: 'agent-456',
          sessionId: 'session-789',
          role: 'worker',
          model: 'claude-3-7-sonnet',
        },
        branch: {
          name: 'feature/oauth',
          targetBranch: 'main',
          baseSha: 'abc1234',
          headSha: 'def5678',
        },
        worktree: {
          path: '.visocity/worktrees/issue-42',
          isDetached: true,
        },
        pullRequest: {
          number: 42,
          url: 'https://github.com/org/repo/pull/42',
          title: 'Add OAuth Support',
          draft: false,
        },
        timestamps: {
          createdAt: now,
          updatedAt: now,
          assignedAt: now,
          startedAt: now,
        },
        metadata: {
          priority: 'high',
          estimateHours: 4,
        },
        history: [
          {
            id: 'h-1',
            fromStatus: null,
            toStatus: 'queued',
            timestamp: now,
            actor: 'user',
            reason: 'Task created',
          },
          {
            id: 'h-2',
            fromStatus: 'queued',
            toStatus: 'assigned',
            timestamp: now,
            actor: 'system',
          },
          {
            id: 'h-3',
            fromStatus: 'assigned',
            toStatus: 'in_progress',
            timestamp: now,
            actor: 'agent',
          },
        ],
      };

      const result = TaskSchema.safeParse(validTask);
      expect(result.success).toBe(true);
    });

    it('rejects a task with an empty title', () => {
      const now = new Date().toISOString();
      const invalidTask = {
        id: 'task-invalid',
        title: '',
        status: 'queued',
        timestamps: {
          createdAt: now,
          updatedAt: now,
        },
      };

      const result = TaskSchema.safeParse(invalidTask);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateTaskInputSchema', () => {
    it('applies sensible defaults for optional fields', () => {
      const input = {
        title: 'Fix issue #12',
      };

      const parsed = CreateTaskInputSchema.parse(input);
      expect(parsed.title).toBe('Fix issue #12');
      expect(parsed.description).toBe('');
      expect(parsed.status).toBe('queued');
      expect(parsed.actor).toBe('user');
      expect(parsed.metadata).toEqual({});
    });

    it('validates custom fields when provided', () => {
      const input = {
        id: 'custom-task-id',
        title: 'Custom task',
        description: 'Custom description',
        status: 'assigned' as const,
        agent: {
          agentId: 'worker-1',
        },
        branch: {
          name: 'fix/12',
        },
        actor: 'mayor',
      };

      const parsed = CreateTaskInputSchema.parse(input);
      expect(parsed.id).toBe('custom-task-id');
      expect(parsed.status).toBe('assigned');
      expect(parsed.agent?.agentId).toBe('worker-1');
      expect(parsed.branch?.name).toBe('fix/12');
      expect(parsed.actor).toBe('mayor');
    });
  });

  describe('UpdateTaskInputSchema & TransitionTaskInputSchema', () => {
    it('validates update input with partial fields', () => {
      const updateInput = {
        title: 'Updated title',
        description: 'Updated description',
        metadata: { tag: 'urgent' },
      };

      const parsed = UpdateTaskInputSchema.safeParse(updateInput);
      expect(parsed.success).toBe(true);
    });

    it('validates transition input with target status and reason', () => {
      const transitionInput = {
        status: 'approved' as const,
        actor: 'mayor',
        reason: 'Code review approved after manual walkthrough',
      };

      const parsed = TransitionTaskInputSchema.safeParse(transitionInput);
      expect(parsed.success).toBe(true);
    });
  });

  describe('TaskFilterSchema', () => {
    it('validates filter parameters', () => {
      const filter = {
        status: ['in_progress' as const, 'awaiting_review' as const],
        agentId: 'agent-1',
        sessionId: 'session-1',
        branchName: 'main',
        prNumber: 42,
        query: 'OAuth',
        limit: 10,
        offset: 0,
        sortBy: 'updatedAt' as const,
        sortDirection: 'desc' as const,
      };

      const parsed = TaskFilterSchema.safeParse(filter);
      expect(parsed.success).toBe(true);
    });
  });
});
