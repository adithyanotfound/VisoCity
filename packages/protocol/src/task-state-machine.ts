import { TaskStatus, TaskTimestamps } from './task.js';

/**
 * Explicit state transition table defining permitted forward and backward moves.
 *
 * Rules:
 * - queued -> assigned, in_progress, failed
 * - assigned -> in_progress, queued, failed
 * - in_progress -> awaiting_review, failed, queued, assigned
 * - awaiting_review -> approved, in_progress, failed
 * - approved -> ready_to_merge, in_progress, failed
 * - ready_to_merge -> merged, in_progress, failed
 * - merged -> [] (terminal, cannot transition to any other status)
 * - failed -> queued (retryable back to queue)
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ['assigned', 'in_progress', 'failed'],
  assigned: ['in_progress', 'queued', 'failed'],
  in_progress: ['awaiting_review', 'failed', 'queued', 'assigned'],
  awaiting_review: ['approved', 'in_progress', 'failed'],
  approved: ['ready_to_merge', 'in_progress', 'failed'],
  ready_to_merge: ['merged', 'in_progress', 'failed'],
  merged: [],
  failed: ['queued'],
} as const;

/**
 * Custom error thrown when an invalid state transition is attempted.
 */
export class InvalidTaskStateTransitionError extends Error {
  readonly code = 'INVALID_TASK_STATE_TRANSITION';
  readonly taskId?: string;
  readonly currentStatus: TaskStatus;
  readonly targetStatus: TaskStatus;
  readonly allowedTransitions: readonly TaskStatus[];

  constructor(currentStatus: TaskStatus, targetStatus: TaskStatus, taskId?: string) {
    const allowed = TASK_STATUS_TRANSITIONS[currentStatus] ?? [];
    const targetLabel = targetStatus as string;
    const taskQualifier = taskId ? ` for task "${taskId}"` : '';
    const allowedStr = allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)';

    super(
      `Invalid task state transition${taskQualifier}: cannot transition from "${currentStatus}" to "${targetLabel}". ` +
      `Allowed transitions: [${allowedStr}]`
    );

    this.name = 'InvalidTaskStateTransitionError';
    this.taskId = taskId;
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
    this.allowedTransitions = allowed;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, InvalidTaskStateTransitionError.prototype);
  }
}

/**
 * Task state machine helper and validator.
 */
export class TaskStateMachine {
  /**
   * Returns list of allowed next statuses from current status.
   */
  static getAllowedTransitions(currentStatus: TaskStatus): readonly TaskStatus[] {
    return TASK_STATUS_TRANSITIONS[currentStatus] ?? [];
  }

  /**
   * Returns true if transition from currentStatus to targetStatus is valid.
   * Disallows redundant self-transitions (e.g. in_progress -> in_progress).
   */
  static canTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): boolean {
    if (currentStatus === targetStatus) {
      return false;
    }
    const allowed = TASK_STATUS_TRANSITIONS[currentStatus];
    return Boolean(allowed && allowed.includes(targetStatus));
  }

  /**
   * Validates transition; throws InvalidTaskStateTransitionError if transition is invalid.
   */
  static validateTransition(currentStatus: TaskStatus, targetStatus: TaskStatus, taskId?: string): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new InvalidTaskStateTransitionError(currentStatus, targetStatus, taskId);
    }
  }

  /**
   * Returns true if status has no further valid outbound transitions.
   */
  static isTerminal(status: TaskStatus): boolean {
    const allowed = TASK_STATUS_TRANSITIONS[status];
    return !allowed || allowed.length === 0;
  }

  /**
   * Returns true if status can be retried.
   */
  static isRetryable(status: TaskStatus): boolean {
    return status === 'failed';
  }

  /**
   * Maps a task status to its associated timestamp field name in TaskTimestamps.
   */
  static getTimestampFieldName(status: TaskStatus): keyof TaskTimestamps | null {
    switch (status) {
      case 'assigned':
        return 'assignedAt';
      case 'in_progress':
        return 'startedAt';
      case 'awaiting_review':
        return 'reviewRequestedAt';
      case 'approved':
        return 'approvedAt';
      case 'ready_to_merge':
        return 'readyToMergeAt';
      case 'merged':
        return 'mergedAt';
      case 'failed':
        return 'failedAt';
      case 'queued':
      default:
        return null;
    }
  }
}
