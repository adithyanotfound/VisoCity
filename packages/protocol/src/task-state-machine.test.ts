import { describe, it, expect } from 'vitest';
import {
  TASK_STATUSES,
  TaskStatus,
  TaskStateMachine,
  InvalidTaskStateTransitionError,
  TASK_STATUS_TRANSITIONS,
} from './index.js';

describe('TaskStateMachine', () => {
  describe('Valid State Transitions', () => {
    it('allows valid transitions from "queued"', () => {
      expect(TaskStateMachine.canTransition('queued', 'assigned')).toBe(true);
      expect(TaskStateMachine.canTransition('queued', 'in_progress')).toBe(true);
      expect(TaskStateMachine.canTransition('queued', 'failed')).toBe(true);

      expect(() =>
        TaskStateMachine.validateTransition('queued', 'assigned', 'task-1'),
      ).not.toThrow();
      expect(() =>
        TaskStateMachine.validateTransition('queued', 'in_progress', 'task-1'),
      ).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('queued', 'failed', 'task-1')).not.toThrow();
    });

    it('allows valid transitions from "assigned"', () => {
      expect(TaskStateMachine.canTransition('assigned', 'in_progress')).toBe(true);
      expect(TaskStateMachine.canTransition('assigned', 'queued')).toBe(true);
      expect(TaskStateMachine.canTransition('assigned', 'failed')).toBe(true);

      expect(() =>
        TaskStateMachine.validateTransition('assigned', 'in_progress', 'task-2'),
      ).not.toThrow();
      expect(() =>
        TaskStateMachine.validateTransition('assigned', 'queued', 'task-2'),
      ).not.toThrow();
      expect(() =>
        TaskStateMachine.validateTransition('assigned', 'failed', 'task-2'),
      ).not.toThrow();
    });

    it('allows valid transitions from "in_progress"', () => {
      expect(TaskStateMachine.canTransition('in_progress', 'awaiting_review')).toBe(true);
      expect(TaskStateMachine.canTransition('in_progress', 'failed')).toBe(true);
      expect(TaskStateMachine.canTransition('in_progress', 'queued')).toBe(true);
      expect(TaskStateMachine.canTransition('in_progress', 'assigned')).toBe(true);

      expect(() =>
        TaskStateMachine.validateTransition('in_progress', 'awaiting_review'),
      ).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('in_progress', 'failed')).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('in_progress', 'queued')).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('in_progress', 'assigned')).not.toThrow();
    });

    it('allows valid transitions from "awaiting_review"', () => {
      expect(TaskStateMachine.canTransition('awaiting_review', 'approved')).toBe(true);
      expect(TaskStateMachine.canTransition('awaiting_review', 'in_progress')).toBe(true);
      expect(TaskStateMachine.canTransition('awaiting_review', 'failed')).toBe(true);

      expect(() =>
        TaskStateMachine.validateTransition('awaiting_review', 'approved'),
      ).not.toThrow();
      expect(() =>
        TaskStateMachine.validateTransition('awaiting_review', 'in_progress'),
      ).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('awaiting_review', 'failed')).not.toThrow();
    });

    it('allows valid transitions from "approved"', () => {
      expect(TaskStateMachine.canTransition('approved', 'ready_to_merge')).toBe(true);
      expect(TaskStateMachine.canTransition('approved', 'in_progress')).toBe(true);
      expect(TaskStateMachine.canTransition('approved', 'failed')).toBe(true);

      expect(() => TaskStateMachine.validateTransition('approved', 'ready_to_merge')).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('approved', 'in_progress')).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('approved', 'failed')).not.toThrow();
    });

    it('allows valid transitions from "ready_to_merge"', () => {
      expect(TaskStateMachine.canTransition('ready_to_merge', 'merged')).toBe(true);
      expect(TaskStateMachine.canTransition('ready_to_merge', 'in_progress')).toBe(true);
      expect(TaskStateMachine.canTransition('ready_to_merge', 'failed')).toBe(true);

      expect(() => TaskStateMachine.validateTransition('ready_to_merge', 'merged')).not.toThrow();
      expect(() =>
        TaskStateMachine.validateTransition('ready_to_merge', 'in_progress'),
      ).not.toThrow();
      expect(() => TaskStateMachine.validateTransition('ready_to_merge', 'failed')).not.toThrow();
    });

    it('allows retrying a "failed" task back to "queued"', () => {
      expect(TaskStateMachine.canTransition('failed', 'queued')).toBe(true);
      expect(() =>
        TaskStateMachine.validateTransition('failed', 'queued', 'task-failed'),
      ).not.toThrow();
    });
  });

  describe('Invalid State Transitions & Validation', () => {
    it('disallows jumping from "queued" directly to "approved", "ready_to_merge", or "merged"', () => {
      const invalidFromQueued: TaskStatus[] = [
        'awaiting_review',
        'approved',
        'ready_to_merge',
        'merged',
      ];
      for (const target of invalidFromQueued) {
        expect(TaskStateMachine.canTransition('queued', target)).toBe(false);
        expect(() => TaskStateMachine.validateTransition('queued', target, 'task-q')).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('disallows jumping from "assigned" directly to review/merge/merged states', () => {
      const invalidFromAssigned: TaskStatus[] = [
        'awaiting_review',
        'approved',
        'ready_to_merge',
        'merged',
      ];
      for (const target of invalidFromAssigned) {
        expect(TaskStateMachine.canTransition('assigned', target)).toBe(false);
        expect(() => TaskStateMachine.validateTransition('assigned', target)).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('disallows skipping review or merging directly from "in_progress"', () => {
      const invalidFromInProgress: TaskStatus[] = ['approved', 'ready_to_merge', 'merged'];
      for (const target of invalidFromInProgress) {
        expect(TaskStateMachine.canTransition('in_progress', target)).toBe(false);
        expect(() => TaskStateMachine.validateTransition('in_progress', target)).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('disallows merging directly from "awaiting_review" without approval', () => {
      const invalidFromReview: TaskStatus[] = ['ready_to_merge', 'merged', 'queued', 'assigned'];
      for (const target of invalidFromReview) {
        expect(TaskStateMachine.canTransition('awaiting_review', target)).toBe(false);
        expect(() => TaskStateMachine.validateTransition('awaiting_review', target)).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('disallows merging directly from "approved" without ready_to_merge', () => {
      const invalidFromApproved: TaskStatus[] = ['merged', 'queued', 'assigned', 'awaiting_review'];
      for (const target of invalidFromApproved) {
        expect(TaskStateMachine.canTransition('approved', target)).toBe(false);
        expect(() => TaskStateMachine.validateTransition('approved', target)).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('disallows transitioning out of "merged" (terminal state)', () => {
      for (const target of TASK_STATUSES) {
        expect(TaskStateMachine.canTransition('merged', target)).toBe(false);
        expect(() =>
          TaskStateMachine.validateTransition('merged', target, 'task-merged-1'),
        ).toThrow(InvalidTaskStateTransitionError);
      }
    });

    it('disallows transitions from "failed" except for "queued" (retry)', () => {
      const nonRetryStatuses = TASK_STATUSES.filter((s) => s !== 'queued');
      for (const target of nonRetryStatuses) {
        expect(TaskStateMachine.canTransition('failed', target)).toBe(false);
        expect(() => TaskStateMachine.validateTransition('failed', target)).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('disallows redundant self-transitions for all states', () => {
      for (const status of TASK_STATUSES) {
        expect(TaskStateMachine.canTransition(status, status)).toBe(false);
        expect(() => TaskStateMachine.validateTransition(status, status, 'task-self')).toThrow(
          InvalidTaskStateTransitionError,
        );
      }
    });

    it('populates InvalidTaskStateTransitionError with accurate properties', () => {
      try {
        TaskStateMachine.validateTransition('queued', 'merged', 'task-100');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(InvalidTaskStateTransitionError);
        const error = err as InvalidTaskStateTransitionError;
        expect(error.code).toBe('INVALID_TASK_STATE_TRANSITION');
        expect(error.taskId).toBe('task-100');
        expect(error.currentStatus).toBe('queued');
        expect(error.targetStatus).toBe('merged');
        expect(error.allowedTransitions).toEqual(['assigned', 'in_progress', 'failed']);
        expect(error.message).toContain('cannot transition from "queued" to "merged"');
        expect(error.message).toContain('Allowed transitions: [assigned, in_progress, failed]');
      }
    });

    it('formats error properly when no taskId is passed and state is terminal', () => {
      try {
        TaskStateMachine.validateTransition('merged', 'in_progress');
        expect.unreachable('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(InvalidTaskStateTransitionError);
        const error = err as InvalidTaskStateTransitionError;
        expect(error.taskId).toBeUndefined();
        expect(error.message).toContain('none (terminal state)');
      }
    });
  });

  describe('Helper Methods & Metadata', () => {
    it('checks isTerminal status', () => {
      expect(TaskStateMachine.isTerminal('merged')).toBe(true);
      expect(TaskStateMachine.isTerminal('queued')).toBe(false);
      expect(TaskStateMachine.isTerminal('in_progress')).toBe(false);
      expect(TaskStateMachine.isTerminal('failed')).toBe(false);
      expect(TaskStateMachine.isTerminal('approved')).toBe(false);
    });

    it('checks isRetryable status', () => {
      expect(TaskStateMachine.isRetryable('failed')).toBe(true);
      expect(TaskStateMachine.isRetryable('queued')).toBe(false);
      expect(TaskStateMachine.isRetryable('in_progress')).toBe(false);
      expect(TaskStateMachine.isRetryable('merged')).toBe(false);
    });

    it('returns exact allowed transitions matching TASK_STATUS_TRANSITIONS table', () => {
      for (const status of TASK_STATUSES) {
        expect(TaskStateMachine.getAllowedTransitions(status)).toEqual(
          TASK_STATUS_TRANSITIONS[status],
        );
      }
    });

    it('maps status to correct timestamp field names', () => {
      expect(TaskStateMachine.getTimestampFieldName('queued')).toBeNull();
      expect(TaskStateMachine.getTimestampFieldName('assigned')).toBe('assignedAt');
      expect(TaskStateMachine.getTimestampFieldName('in_progress')).toBe('startedAt');
      expect(TaskStateMachine.getTimestampFieldName('awaiting_review')).toBe('reviewRequestedAt');
      expect(TaskStateMachine.getTimestampFieldName('approved')).toBe('approvedAt');
      expect(TaskStateMachine.getTimestampFieldName('ready_to_merge')).toBe('readyToMergeAt');
      expect(TaskStateMachine.getTimestampFieldName('merged')).toBe('mergedAt');
      expect(TaskStateMachine.getTimestampFieldName('failed')).toBe('failedAt');
    });
  });
});
