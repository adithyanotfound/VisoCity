import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { TaskService, InMemoryTaskRepository } from '@visoagent/storage';
import { Task } from '@visoagent/protocol';

describe('Tasks REST API Endpoints', () => {
  let server: FastifyInstance;
  let taskService: TaskService;

  beforeAll(async () => {
    taskService = new TaskService(new InMemoryTaskRepository());
    server = await buildServer({
      logger: false,
      taskService,
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Clear out tasks before each test
    const existing = await taskService.listTasks();
    for (const t of existing) {
      await taskService.deleteTask(t.id);
    }
  });

  it('creates a task via POST /api/tasks with 201 Created', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'Add isometric camera smoothing',
        description: 'Implement lerp for viewport panning',
        metadata: { priority: 'medium' },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.task).toBeDefined();
    expect(body.task.id).toBeDefined();
    expect(body.task.title).toBe('Add isometric camera smoothing');
    expect(body.task.status).toBe('queued');
    expect(body.task.timestamps.createdAt).toBeDefined();
  });

  it('rejects POST /api/tasks with empty title with 400 Bad Request', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: '',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('ValidationError');
  });

  it('lists tasks and filters via GET /api/tasks', async () => {
    await taskService.createTask({ title: 'Task 1', status: 'queued' });
    await taskService.createTask({ title: 'Task 2', status: 'in_progress' });
    await taskService.createTask({ title: 'Task 3', status: 'in_progress' });

    // List all
    const allRes = await server.inject({
      method: 'GET',
      url: '/api/tasks',
    });
    expect(allRes.statusCode).toBe(200);
    const allBody = JSON.parse(allRes.body);
    expect(allBody.tasks.length).toBe(3);
    expect(allBody.total).toBe(3);

    // Filter by status
    const filteredRes = await server.inject({
      method: 'GET',
      url: '/api/tasks?status=in_progress',
    });
    expect(filteredRes.statusCode).toBe(200);
    const filteredBody = JSON.parse(filteredRes.body);
    expect(filteredBody.tasks.length).toBe(2);
    expect(filteredBody.tasks.every((t: Task) => t.status === 'in_progress')).toBe(true);

    // Search query
    const searchRes = await server.inject({
      method: 'GET',
      url: '/api/tasks?query=Task%201',
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.tasks.length).toBe(1);
    expect(searchBody.tasks[0].title).toBe('Task 1');
  });

  it('gets a single task via GET /api/tasks/:id or returns 404', async () => {
    const task = await taskService.createTask({ title: 'Fetch task' });

    const successRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    });
    expect(successRes.statusCode).toBe(200);
    const successBody = JSON.parse(successRes.body);
    expect(successBody.task.id).toBe(task.id);

    const notFoundRes = await server.inject({
      method: 'GET',
      url: '/api/tasks/non-existent-id',
    });
    expect(notFoundRes.statusCode).toBe(404);
    const notFoundBody = JSON.parse(notFoundRes.body);
    expect(notFoundBody.error).toBe('TaskNotFound');
  });

  it('updates task metadata via PATCH /api/tasks/:id', async () => {
    const task = await taskService.createTask({ title: 'Before update' });

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/tasks/${task.id}`,
      payload: {
        title: 'After update',
        description: 'New description',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.title).toBe('After update');
    expect(body.task.description).toBe('New description');
  });

  it('handles valid and invalid transitions via POST /api/tasks/:id/transition', async () => {
    const task = await taskService.createTask({ title: 'Transition test' });

    // Invalid transition: queued -> merged
    const invalidRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/transition`,
      payload: {
        status: 'merged',
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    const invalidBody = JSON.parse(invalidRes.body);
    expect(invalidBody.error).toBe('InvalidTaskStateTransition');
    expect(invalidBody.currentStatus).toBe('queued');
    expect(invalidBody.targetStatus).toBe('merged');
    expect(invalidBody.allowedTransitions).toEqual(['assigned', 'in_progress', 'failed']);

    // Valid transition: queued -> assigned
    const validRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/transition`,
      payload: {
        status: 'assigned',
        reason: 'Assigned to specialist',
      },
    });
    expect(validRes.statusCode).toBe(200);
    const validBody = JSON.parse(validRes.body);
    expect(validBody.task.status).toBe('assigned');
  });

  it('executes full task lifecycle via dedicated action routes', async () => {
    const task = await taskService.createTask({ title: 'Full workflow' });

    // 1. /assign
    const assignRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/assign`,
      payload: {
        agent: { agentId: 'runner-1', role: 'runner' },
        reason: 'Assigned runner',
      },
    });
    expect(assignRes.statusCode).toBe(200);
    expect(JSON.parse(assignRes.body).task.status).toBe('assigned');

    // 2. /start
    const startRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/start`,
      payload: { reason: 'Started work' },
    });
    expect(startRes.statusCode).toBe(200);
    expect(JSON.parse(startRes.body).task.status).toBe('in_progress');

    // 3. /submit-review
    const reviewRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/submit-review`,
      payload: {
        pullRequest: { number: 99, title: 'PR 99' },
        reason: 'Ready for review',
      },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(JSON.parse(reviewRes.body).task.status).toBe('awaiting_review');

    // 4. /approve
    const approveRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/approve`,
      payload: { reason: 'LGTM' },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(JSON.parse(approveRes.body).task.status).toBe('approved');

    // 5. /ready-to-merge
    const readyRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/ready-to-merge`,
    });
    expect(readyRes.statusCode).toBe(200);
    expect(JSON.parse(readyRes.body).task.status).toBe('ready_to_merge');

    // 6. /merge
    const mergeRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/merge`,
      payload: {
        result: { summary: 'Merged successfully' },
      },
    });
    expect(mergeRes.statusCode).toBe(200);
    expect(JSON.parse(mergeRes.body).task.status).toBe('merged');
  });

  it('supports fail and retry endpoints', async () => {
    const task = await taskService.createTask({ title: 'To be failed' });
    await taskService.startTask(task.id);

    // /fail
    const failRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/fail`,
      payload: {
        error: { message: 'Build error' },
      },
    });
    expect(failRes.statusCode).toBe(200);
    expect(JSON.parse(failRes.body).task.status).toBe('failed');

    // /retry
    const retryRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${task.id}/retry`,
      payload: { reason: 'Retrying now' },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(JSON.parse(retryRes.body).task.status).toBe('queued');
  });

  it('deletes a task via DELETE /api/tasks/:id', async () => {
    const task = await taskService.createTask({ title: 'Task to delete' });

    const deleteRes = await server.inject({
      method: 'DELETE',
      url: `/api/tasks/${task.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.body).success).toBe(true);

    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${task.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});
