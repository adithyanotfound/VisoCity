import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvalidTaskStateTransitionError } from '@visoagent/protocol';
import { InMemoryTaskRepository } from './repositories/in-memory-task-repository.js';
import { SqliteTaskRepository } from './repositories/sqlite-task-repository.js';
import { createDatabase } from './sqlite/db.js';
import { TaskService } from './services/task-service.js';
import { TaskNotFoundError } from './errors.js';

describe('TaskService Lifecycle & State Machine', () => {
  const createServiceWithRepo = (type: 'memory' | 'sqlite') => {
    const repo =
      type === 'memory'
        ? new InMemoryTaskRepository()
        : new SqliteTaskRepository(createDatabase({ inMemory: true }));
    return new TaskService(repo);
  };

  ['memory' as const, 'sqlite' as const].forEach((repoType) => {
    describe(`Using ${repoType.toUpperCase()} Repository`, () => {
      let service: TaskService;

      beforeEach(() => {
        service = createServiceWithRepo(repoType);
      });

      it('executes full golden path lifecycle: queued -> assigned -> in_progress -> awaiting_review -> approved -> ready_to_merge -> merged', async () => {
        const createdListener = vi.fn();
        const transitionedListener = vi.fn();
        const updatedListener = vi.fn();

        service.on('task:created', createdListener);
        service.on('task:transitioned', transitionedListener);
        service.on('task:updated', updatedListener);

        // 1. Create task
        const task = await service.createTask({
          title: 'Implement spatial pathfinding',
          description: 'Calculate road vectors for vehicle traffic',
          metadata: { priority: 'high' },
        });

        expect(task.id).toBeDefined();
        expect(task.title).toBe('Implement spatial pathfinding');
        expect(task.status).toBe('queued');
        expect(task.timestamps.createdAt).toBeDefined();
        expect(task.timestamps.updatedAt).toBeDefined();
        expect(task.history.length).toBe(1);
        expect(task.history[0].toStatus).toBe('queued');
        expect(createdListener).toHaveBeenCalledWith(task);

        // 2. Assign task
        const assigned = await service.assignTask(
          task.id,
          {
            agentId: 'architect-1',
            sessionId: 'sess-abc',
            role: 'architect',
            model: 'claude-3-7-sonnet',
          },
          { reason: 'Assigned to senior architect' },
        );

        expect(assigned.status).toBe('assigned');
        expect(assigned.agent?.agentId).toBe('architect-1');
        expect(assigned.agent?.role).toBe('architect');
        expect(assigned.timestamps.assignedAt).toBeDefined();
        expect(assigned.history.length).toBe(2);
        expect(assigned.history[1].fromStatus).toBe('queued');
        expect(assigned.history[1].toStatus).toBe('assigned');

        // 3. Start task
        const started = await service.startTask(task.id, { reason: 'Agent query started' });
        expect(started.status).toBe('in_progress');
        expect(started.timestamps.startedAt).toBeDefined();
        expect(started.history.length).toBe(3);

        // 4. Submit for review
        const review = await service.submitForReview(task.id, {
          pullRequest: {
            number: 42,
            url: 'https://github.com/org/repo/pull/42',
            title: 'Pathfinding AST vector calculations',
          },
          reason: 'Implementation finished and tests passing',
        });
        expect(review.status).toBe('awaiting_review');
        expect(review.pullRequest?.number).toBe(42);
        expect(review.timestamps.reviewRequestedAt).toBeDefined();
        expect(review.history.length).toBe(4);

        // 5. Approve task
        const approved = await service.approveTask(task.id, {
          reason: 'Mayor stamped approval',
          actor: 'mayor',
        });
        expect(approved.status).toBe('approved');
        expect(approved.timestamps.approvedAt).toBeDefined();
        expect(approved.history.length).toBe(5);

        // 6. Mark ready to merge
        const readyToMerge = await service.markReadyToMerge(task.id, {
          reason: 'All checks passed',
        });
        expect(readyToMerge.status).toBe('ready_to_merge');
        expect(readyToMerge.timestamps.readyToMergeAt).toBeDefined();
        expect(readyToMerge.history.length).toBe(6);

        // 7. Mark merged (terminal state)
        const merged = await service.markMerged(task.id, {
          result: {
            summary: 'Successfully merged PR #42 into main branch',
            artifacts: ['dist/bundle.js'],
          },
          reason: 'Fast-forward merge completed',
        });
        expect(merged.status).toBe('merged');
        expect(merged.timestamps.mergedAt).toBeDefined();
        expect(merged.result?.summary).toContain('Successfully merged PR #42');
        expect(merged.history.length).toBe(7);

        expect(transitionedListener).toHaveBeenCalledTimes(6);
        expect(updatedListener).toHaveBeenCalledTimes(6);
      });

      it('supports revision rework loop: awaiting_review -> in_progress -> awaiting_review -> approved', async () => {
        const task = await service.createTask({
          title: 'Implement isometric crane rendering',
        });
        await service.startTask(task.id);
        await service.submitForReview(task.id, { reason: 'First iteration' });

        // Changes requested by reviewer -> returns to in_progress
        const reworked = await service.transitionTask(task.id, {
          status: 'in_progress',
          reason: 'Changes requested on shadow depths',
          actor: 'reviewer',
        });
        expect(reworked.status).toBe('in_progress');

        // Resubmit for review
        const resubmitted = await service.submitForReview(task.id, {
          reason: 'Fixed shadow depths',
        });
        expect(resubmitted.status).toBe('awaiting_review');

        // Approve
        const approved = await service.approveTask(task.id, { reason: 'Looks great!' });
        expect(approved.status).toBe('approved');
      });

      it('supports failure and retry loop: in_progress -> failed -> queued -> in_progress', async () => {
        const task = await service.createTask({
          title: 'Complex database migration',
        });
        await service.startTask(task.id);

        // Fail task
        const failed = await service.failTask(task.id, {
          message: 'Syntax error in migration script',
          code: 'MIGRATION_SYNTAX_ERROR',
        });
        expect(failed.status).toBe('failed');
        expect(failed.error?.message).toBe('Syntax error in migration script');
        expect(failed.timestamps.failedAt).toBeDefined();

        // Retry task
        const retried = await service.retryTask(task.id, { reason: 'Fix applied, retrying' });
        expect(retried.status).toBe('queued');

        // Restart task
        const restarted = await service.startTask(task.id);
        expect(restarted.status).toBe('in_progress');
      });

      it('supports direct transition from queued to in_progress (auto-assigned/started)', async () => {
        const task = await service.createTask({ title: 'Quick fix' });
        const started = await service.startTask(task.id);
        expect(started.status).toBe('in_progress');
      });

      it('supports reassignment from in_progress back to assigned', async () => {
        const task = await service.createTask({ title: 'Work task' });
        await service.startTask(task.id);

        const reassigned = await service.assignTask(task.id, {
          agentId: 'worker-2',
          role: 'worker',
        });
        expect(reassigned.status).toBe('assigned');
        expect(reassigned.agent?.agentId).toBe('worker-2');
      });

      it('rejects invalid state transitions and preserves task state', async () => {
        const task = await service.createTask({ title: 'Strict state task' });

        // queued -> merged is invalid
        await expect(service.transitionTask(task.id, 'merged')).rejects.toThrow(
          InvalidTaskStateTransitionError,
        );

        // queued -> approved is invalid
        await expect(service.approveTask(task.id)).rejects.toThrow(InvalidTaskStateTransitionError);

        // Task status should remain queued
        const current = await service.getTaskOrThrow(task.id);
        expect(current.status).toBe('queued');
      });

      it('disallows any transition from merged state', async () => {
        const task = await service.createTask({ title: 'Task to be merged' });
        await service.startTask(task.id);
        await service.submitForReview(task.id);
        await service.approveTask(task.id);
        await service.markReadyToMerge(task.id);
        await service.markMerged(task.id);

        // Cannot move from merged to in_progress
        await expect(service.startTask(task.id)).rejects.toThrow(InvalidTaskStateTransitionError);

        // Cannot move from merged to queued
        await expect(service.retryTask(task.id)).rejects.toThrow(InvalidTaskStateTransitionError);
      });

      it('throws TaskNotFoundError when operating on non-existent task', async () => {
        await expect(service.getTaskOrThrow('non-existent')).rejects.toThrow(TaskNotFoundError);
        await expect(service.updateTask('non-existent', { title: 'New' })).rejects.toThrow(
          TaskNotFoundError,
        );
        await expect(service.startTask('non-existent')).rejects.toThrow(TaskNotFoundError);
        await expect(service.deleteTask('non-existent')).rejects.toThrow(TaskNotFoundError);
      });

      it('updates mutable task fields and emits task:updated', async () => {
        const updateListener = vi.fn();
        service.on('task:updated', updateListener);

        const task = await service.createTask({ title: 'Original title' });
        const updated = await service.updateTask(task.id, {
          title: 'Modified title',
          description: 'Detailed modified description',
          metadata: { customFlag: true },
        });

        expect(updated.title).toBe('Modified title');
        expect(updated.description).toBe('Detailed modified description');
        expect(updated.metadata.customFlag).toBe(true);
        expect(updateListener).toHaveBeenCalledWith(updated);
      });

      it('deletes a task and emits task:deleted', async () => {
        const deleteListener = vi.fn();
        service.on('task:deleted', deleteListener);

        const task = await service.createTask({ title: 'To be deleted' });
        const deleted = await service.deleteTask(task.id);

        expect(deleted).toBe(true);
        expect(deleteListener).toHaveBeenCalledWith(task.id);

        const found = await service.getTask(task.id);
        expect(found).toBeNull();
      });

      it('lists tasks with multi-field filtering', async () => {
        await service.createTask({
          title: 'Task A',
          status: 'queued',
          agent: { agentId: 'agent-10' },
        });
        await service.createTask({
          title: 'Task B',
          status: 'in_progress',
          agent: { agentId: 'agent-10' },
        });
        await service.createTask({
          title: 'Task C',
          status: 'in_progress',
          agent: { agentId: 'agent-20' },
        });

        const inProgressAgent10 = await service.listTasks({
          status: 'in_progress',
          agentId: 'agent-10',
        });
        expect(inProgressAgent10.length).toBe(1);
        expect(inProgressAgent10[0].title).toBe('Task B');

        const allAgent10Count = await service.countTasks({ agentId: 'agent-10' });
        expect(allAgent10Count).toBe(2);
      });
    });
  });
});
