import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  Task,
  TaskStatus,
  TaskFilter,
  CreateTaskInput,
  CreateTaskInputSchema,
  UpdateTaskInput,
  UpdateTaskInputSchema,
  TransitionTaskInput,
  TransitionTaskInputSchema,
  TaskAgent,
  TaskPullRequest,
  TaskResult,
  TaskError,
  TaskStateMachine,
  TaskTransitionHistoryEntry,
  TaskSchema,
} from '@visoagent/protocol';
import { ITaskRepository } from '../types.js';
import { TaskNotFoundError } from '../errors.js';

export class TaskService extends EventEmitter {
  constructor(private repository: ITaskRepository) {
    super();
  }

  /**
   * Creates a new task and registers its initial creation event.
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    const validatedInput = CreateTaskInputSchema.parse(input);
    const now = new Date().toISOString();
    const taskId = validatedInput.id ?? `task-${randomUUID()}`;
    const initialStatus = validatedInput.status ?? 'queued';

    const timestamps = {
      createdAt: now,
      updatedAt: now,
    } as Task['timestamps'];

    const timestampField = TaskStateMachine.getTimestampFieldName(initialStatus);
    if (timestampField) {
      timestamps[timestampField] = now;
    }

    const initialHistoryEntry: TaskTransitionHistoryEntry = {
      id: `hist-${randomUUID()}`,
      fromStatus: null,
      toStatus: initialStatus,
      timestamp: now,
      reason: validatedInput.reason ?? 'Task created',
      actor: validatedInput.actor ?? 'user',
    };

    const taskToCreate: Task = TaskSchema.parse({
      id: taskId,
      title: validatedInput.title,
      description: validatedInput.description ?? '',
      status: initialStatus,
      agent: validatedInput.agent,
      branch: validatedInput.branch,
      worktree: validatedInput.worktree,
      pullRequest: validatedInput.pullRequest,
      timestamps,
      metadata: validatedInput.metadata ?? {},
      history: [initialHistoryEntry],
    });

    const created = await this.repository.create(taskToCreate);
    this.emit('task:created', created);
    return created;
  }

  /**
   * Retrieves a task by ID. Returns null if not found.
   */
  async getTask(id: string): Promise<Task | null> {
    return this.repository.findById(id);
  }

  /**
   * Retrieves a task by ID or throws TaskNotFoundError.
   */
  async getTaskOrThrow(id: string): Promise<Task> {
    const task = await this.getTask(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    return task;
  }

  /**
   * Updates task details (title, description, metadata, etc.) without changing state.
   */
  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const validatedInput = UpdateTaskInputSchema.parse(input);
    const task = await this.getTaskOrThrow(id);

    const now = new Date().toISOString();

    if (validatedInput.title !== undefined) {
      task.title = validatedInput.title;
    }
    if (validatedInput.description !== undefined) {
      task.description = validatedInput.description;
    }
    if (validatedInput.agent !== undefined) {
      task.agent = { ...task.agent, ...validatedInput.agent };
    }
    if (validatedInput.branch !== undefined) {
      task.branch = { ...task.branch, ...validatedInput.branch };
    }
    if (validatedInput.worktree !== undefined) {
      task.worktree = { ...task.worktree, ...validatedInput.worktree };
    }
    if (validatedInput.pullRequest !== undefined) {
      task.pullRequest = { ...task.pullRequest, ...validatedInput.pullRequest };
    }
    if (validatedInput.metadata !== undefined) {
      task.metadata = { ...task.metadata, ...validatedInput.metadata };
    }
    if (validatedInput.error !== undefined) {
      task.error = validatedInput.error;
    }
    if (validatedInput.result !== undefined) {
      task.result = validatedInput.result;
    }

    task.timestamps.updatedAt = now;

    const updated = await this.repository.update(task);
    this.emit('task:updated', updated);
    return updated;
  }

  /**
   * Performs an explicit state transition with strict validation.
   */
  async transitionTask(id: string, input: TransitionTaskInput | TaskStatus): Promise<Task> {
    const transitionInput =
      typeof input === 'string'
        ? ({ status: input } as TransitionTaskInput)
        : TransitionTaskInputSchema.parse(input);

    const task = await this.getTaskOrThrow(id);
    const currentStatus = task.status;
    const nextStatus = transitionInput.status;

    // Validate state transition through the formal state machine
    TaskStateMachine.validateTransition(currentStatus, nextStatus, task.id);

    const now = new Date().toISOString();
    task.status = nextStatus;
    task.timestamps.updatedAt = now;

    const timestampField = TaskStateMachine.getTimestampFieldName(nextStatus);
    if (timestampField) {
      task.timestamps[timestampField] = now;
    }

    // Apply any accompanying contextual updates
    if (transitionInput.agent) {
      task.agent = { ...task.agent, ...transitionInput.agent };
    }
    if (transitionInput.branch) {
      task.branch = { ...task.branch, ...transitionInput.branch };
    }
    if (transitionInput.worktree) {
      task.worktree = { ...task.worktree, ...transitionInput.worktree };
    }
    if (transitionInput.pullRequest) {
      task.pullRequest = { ...task.pullRequest, ...transitionInput.pullRequest };
    }
    if (transitionInput.error) {
      task.error = transitionInput.error;
    }
    if (transitionInput.result) {
      task.result = transitionInput.result;
    }
    if (transitionInput.metadata) {
      task.metadata = { ...task.metadata, ...transitionInput.metadata };
    }

    const historyEntry: TaskTransitionHistoryEntry = {
      id: `hist-${randomUUID()}`,
      fromStatus: currentStatus,
      toStatus: nextStatus,
      timestamp: now,
      reason: transitionInput.reason,
      actor: transitionInput.actor ?? 'system',
      metadata: transitionInput.metadata,
    };

    task.history.push(historyEntry);

    const updated = await this.repository.update(task);

    this.emit('task:transitioned', updated, historyEntry);
    this.emit('task:updated', updated);

    return updated;
  }

  /**
   * Lists tasks with optional query, filter, sorting, and pagination.
   */
  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    return this.repository.list(filter);
  }

  /**
   * Counts tasks matching filter.
   */
  async countTasks(filter: TaskFilter = {}): Promise<number> {
    return this.repository.count(filter);
  }

  /**
   * Deletes a task by ID.
   */
  async deleteTask(id: string): Promise<boolean> {
    await this.getTaskOrThrow(id);
    const deleted = await this.repository.delete(id);
    if (deleted) {
      this.emit('task:deleted', id);
    }
    return deleted;
  }

  // --- Specialized Lifecycle Helpers ---

  /**
   * Assigns an agent/session to the task.
   */
  async assignTask(
    id: string,
    agent: TaskAgent,
    options: { reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'assigned',
      agent,
      reason: options.reason ?? `Assigned to ${agent.role ?? agent.agentId ?? 'agent'}`,
      actor: options.actor ?? 'system',
    });
  }

  /**
   * Starts task execution (assigned -> in_progress or queued -> in_progress).
   */
  async startTask(
    id: string,
    options: { reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'in_progress',
      reason: options.reason ?? 'Execution started',
      actor: options.actor ?? 'agent',
    });
  }

  /**
   * Submits completed task work for review (in_progress -> awaiting_review).
   */
  async submitForReview(
    id: string,
    options: { pullRequest?: TaskPullRequest; reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'awaiting_review',
      pullRequest: options.pullRequest,
      reason: options.reason ?? 'Submitted for review',
      actor: options.actor ?? 'agent',
    });
  }

  /**
   * Approves task after review (awaiting_review -> approved).
   */
  async approveTask(
    id: string,
    options: { reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'approved',
      reason: options.reason ?? 'Task approved',
      actor: options.actor ?? 'mayor',
    });
  }

  /**
   * Marks task as ready to merge (approved -> ready_to_merge).
   */
  async markReadyToMerge(
    id: string,
    options: { reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'ready_to_merge',
      reason: options.reason ?? 'Pre-merge checks verified, ready to merge',
      actor: options.actor ?? 'system',
    });
  }

  /**
   * Marks task as merged into target branch (ready_to_merge -> merged).
   */
  async markMerged(
    id: string,
    options: { result?: TaskResult; reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'merged',
      result: options.result,
      reason: options.reason ?? 'Branch successfully merged into target',
      actor: options.actor ?? 'system',
    });
  }

  /**
   * Marks task as failed from any active state.
   */
  async failTask(
    id: string,
    error: TaskError | string,
    options: { reason?: string; actor?: string } = {}
  ): Promise<Task> {
    const errorObj: TaskError = typeof error === 'string' ? { message: error } : error;
    return this.transitionTask(id, {
      status: 'failed',
      error: errorObj,
      reason: options.reason ?? errorObj.message,
      actor: options.actor ?? 'system',
    });
  }

  /**
   * Retries a failed task, returning it to queued state.
   */
  async retryTask(
    id: string,
    options: { reason?: string; actor?: string } = {}
  ): Promise<Task> {
    return this.transitionTask(id, {
      status: 'queued',
      reason: options.reason ?? 'Task retried',
      actor: options.actor ?? 'user',
    });
  }
}
