import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  TransitionTaskInputSchema,
  TaskFilterSchema,
  InvalidTaskStateTransitionError,
  TaskAgentSchema,
  TaskPullRequestSchema,
  TaskResultSchema,
  TaskErrorSchema,
} from '@visoagent/protocol';
import { TaskService, TaskNotFoundError, TaskValidationError } from '@visoagent/storage';
import { z } from 'zod';

export interface TasksPluginOptions extends FastifyPluginOptions {
  taskService: TaskService;
}

export async function tasksRoutes(
  server: FastifyInstance,
  options: Partial<TasksPluginOptions>
): Promise<void> {
  const taskService = options.taskService ?? server.taskService;
  if (!taskService) {
    throw new Error('TaskService must be provided in tasksRoutes options or server decorator');
  }

  // Error handler helper
  const handleError = (err: unknown, reply: FastifyReply) => {
    if (err instanceof InvalidTaskStateTransitionError) {
      return reply.status(400).send({
        error: 'InvalidTaskStateTransition',
        message: err.message,
        code: err.code,
        taskId: err.taskId,
        currentStatus: err.currentStatus,
        targetStatus: err.targetStatus,
        allowedTransitions: err.allowedTransitions,
      });
    }

    if (err instanceof TaskNotFoundError) {
      return reply.status(404).send({
        error: 'TaskNotFound',
        message: err.message,
        taskId: err.taskId,
      });
    }

    if (err instanceof TaskValidationError || err instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: err instanceof z.ZodError ? err.errors[0]?.message ?? err.message : err.message,
        details: err instanceof z.ZodError ? err.errors : undefined,
      });
    }

    server.log.error({ err }, 'Unhandled error in tasks route');
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return reply.status(500).send({
      error: 'InternalServerError',
      message: msg,
    });
  };

  // GET /api/tasks - List tasks
  server.get(
    '/api/tasks',
    async (
      request: FastifyRequest<{
        Querystring: Record<string, string | string[] | undefined>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const query = request.query;

        // Normalize query parameters into TaskFilter
        const rawFilter: Record<string, unknown> = {};
        if (query.status) {
          rawFilter.status = Array.isArray(query.status)
            ? query.status
            : (query.status as string).includes(',')
            ? (query.status as string).split(',')
            : query.status;
        }
        if (query.agentId) rawFilter.agentId = query.agentId;
        if (query.sessionId) rawFilter.sessionId = query.sessionId;
        if (query.branchName) rawFilter.branchName = query.branchName;
        if (query.worktreePath) rawFilter.worktreePath = query.worktreePath;
        if (query.prNumber) rawFilter.prNumber = parseInt(query.prNumber as string, 10);
        if (query.query) rawFilter.query = query.query;
        if (query.limit) rawFilter.limit = parseInt(query.limit as string, 10);
        if (query.offset) rawFilter.offset = parseInt(query.offset as string, 10);
        if (query.sortBy) rawFilter.sortBy = query.sortBy;
        if (query.sortDirection) rawFilter.sortDirection = query.sortDirection;

        const filter = TaskFilterSchema.parse(rawFilter);
        const tasks = await taskService.listTasks(filter);
        const total = await taskService.countTasks(filter);

        return reply.status(200).send({
          tasks,
          total,
          limit: filter.limit,
          offset: filter.offset,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks - Create task
  server.post(
    '/api/tasks',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        const input = CreateTaskInputSchema.parse(request.body);
        const task = await taskService.createTask(input);
        return reply.status(201).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // GET /api/tasks/:id - Retrieve single task
  server.get(
    '/api/tasks/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const task = await taskService.getTaskOrThrow(request.params.id);
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // PATCH /api/tasks/:id - Update task details
  server.patch(
    '/api/tasks/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      try {
        const input = UpdateTaskInputSchema.parse(request.body);
        const task = await taskService.updateTask(request.params.id, input);
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // DELETE /api/tasks/:id - Delete task
  server.delete(
    '/api/tasks/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await taskService.deleteTask(request.params.id);
        return reply.status(200).send({ success: true, id: request.params.id });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/transition - Explicit state transition
  server.post(
    '/api/tasks/:id/transition',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      try {
        const input = TransitionTaskInputSchema.parse(request.body);
        const task = await taskService.transitionTask(request.params.id, input);
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/assign - Assign task
  server.post(
    '/api/tasks/:id/assign',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { agent: unknown; reason?: string; actor?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const agent = TaskAgentSchema.parse(body.agent);
        const task = await taskService.assignTask(request.params.id, agent, {
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/start - Start task
  server.post(
    '/api/tasks/:id/start',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string; actor?: string } | undefined;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const task = await taskService.startTask(request.params.id, {
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/submit-review - Submit for review
  server.post(
    '/api/tasks/:id/submit-review',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { pullRequest?: unknown; reason?: string; actor?: string } | undefined;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const pullRequest = body.pullRequest ? TaskPullRequestSchema.parse(body.pullRequest) : undefined;
        const task = await taskService.submitForReview(request.params.id, {
          pullRequest,
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/approve - Approve task
  server.post(
    '/api/tasks/:id/approve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string; actor?: string } | undefined;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const task = await taskService.approveTask(request.params.id, {
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/ready-to-merge - Ready to merge
  server.post(
    '/api/tasks/:id/ready-to-merge',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string; actor?: string } | undefined;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const task = await taskService.markReadyToMerge(request.params.id, {
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/merge - Merged
  server.post(
    '/api/tasks/:id/merge',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { result?: unknown; reason?: string; actor?: string } | undefined;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const result = body.result ? TaskResultSchema.parse(body.result) : undefined;
        const task = await taskService.markMerged(request.params.id, {
          result,
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/fail - Fail task
  server.post(
    '/api/tasks/:id/fail',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { error: unknown; reason?: string; actor?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || { error: 'Unknown error' };
        const error =
          typeof body.error === 'string'
            ? body.error
            : TaskErrorSchema.parse(body.error);
        const task = await taskService.failTask(request.params.id, error, {
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tasks/:id/retry - Retry failed task
  server.post(
    '/api/tasks/:id/retry',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string; actor?: string } | undefined;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body || {};
        const task = await taskService.retryTask(request.params.id, {
          reason: body.reason,
          actor: body.actor,
        });
        return reply.status(200).send({ task });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );
}
