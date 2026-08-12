import { z } from 'zod';

/**
 * Task Status Lifecycle States
 *
 * Core states:
 * - queued: Task is created and waiting to be picked up
 * - assigned: Agent or session has been assigned to the task
 * - in_progress: Work is actively underway
 * - awaiting_review: Work is completed, waiting for human or automated review
 * - approved: Review has passed, approved by reviewer/Mayor
 * - ready_to_merge: Pull request or branch is prepared and validated for merge
 * - merged: Successfully merged into target branch (terminal state)
 * - failed: Task encountered an error or was rejected (retryable to queued)
 */
export const TASK_STATUSES = [
  'queued',
  'assigned',
  'in_progress',
  'awaiting_review',
  'approved',
  'ready_to_merge',
  'merged',
  'failed',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TaskStatusSchema = z.enum(TASK_STATUSES);

/**
 * Normalizes loose status string variants (e.g. 'in progress' -> 'in_progress')
 */
export function normalizeTaskStatus(raw: string): TaskStatus {
  const sanitized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const result = TaskStatusSchema.safeParse(sanitized);
  if (result.success) {
    return result.data;
  }
  throw new Error(`Invalid task status: "${raw}". Valid statuses are: ${TASK_STATUSES.join(', ')}`);
}

/**
 * Schema for agent/session association
 */
export const TaskAgentSchema = z.object({
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  role: z.string().optional(),
  model: z.string().optional(),
});
export type TaskAgent = z.infer<typeof TaskAgentSchema>;

/**
 * Schema for Git branch association
 */
export const TaskBranchSchema = z.object({
  name: z.string().optional(),
  targetBranch: z.string().optional(),
  baseSha: z.string().optional(),
  headSha: z.string().optional(),
});
export type TaskBranch = z.infer<typeof TaskBranchSchema>;

/**
 * Schema for Git worktree association
 */
export const TaskWorktreeSchema = z.object({
  path: z.string().optional(),
  isDetached: z.boolean().optional(),
});
export type TaskWorktree = z.infer<typeof TaskWorktreeSchema>;

/**
 * Schema for Pull Request association
 */
export const TaskPullRequestSchema = z.object({
  number: z.number().int().positive().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  draft: z.boolean().optional(),
});
export type TaskPullRequest = z.infer<typeof TaskPullRequestSchema>;

/**
 * Schema for task lifecycle timestamps
 */
export const TaskTimestampsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  assignedAt: z.string().optional(),
  startedAt: z.string().optional(),
  reviewRequestedAt: z.string().optional(),
  approvedAt: z.string().optional(),
  readyToMergeAt: z.string().optional(),
  mergedAt: z.string().optional(),
  failedAt: z.string().optional(),
});
export type TaskTimestamps = z.infer<typeof TaskTimestampsSchema>;

/**
 * Schema for task error details
 */
export const TaskErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
export type TaskError = z.infer<typeof TaskErrorSchema>;

/**
 * Schema for task execution result details
 */
export const TaskResultSchema = z.object({
  summary: z.string().optional(),
  artifacts: z.array(z.string()).optional(),
  data: z.record(z.unknown()).optional(),
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

/**
 * Schema for state transition history audit log entry
 */
export const TaskTransitionHistoryEntrySchema = z.object({
  id: z.string(),
  fromStatus: TaskStatusSchema.nullable(),
  toStatus: TaskStatusSchema,
  timestamp: z.string(),
  reason: z.string().optional(),
  actor: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type TaskTransitionHistoryEntry = z.infer<typeof TaskTransitionHistoryEntrySchema>;

/**
 * Full Task Model Schema
 */
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Task title cannot be empty'),
  description: z.string().default(''),
  status: TaskStatusSchema,
  agent: TaskAgentSchema.optional(),
  branch: TaskBranchSchema.optional(),
  worktree: TaskWorktreeSchema.optional(),
  pullRequest: TaskPullRequestSchema.optional(),
  timestamps: TaskTimestampsSchema,
  error: TaskErrorSchema.optional(),
  result: TaskResultSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  history: z.array(TaskTransitionHistoryEntrySchema).default([]),
});
export type Task = z.infer<typeof TaskSchema>;

/**
 * Input schema for creating a new task
 */
export const CreateTaskInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Task title cannot be empty'),
  description: z.string().optional().default(''),
  status: TaskStatusSchema.optional().default('queued'),
  agent: TaskAgentSchema.optional(),
  branch: TaskBranchSchema.optional(),
  worktree: TaskWorktreeSchema.optional(),
  pullRequest: TaskPullRequestSchema.optional(),
  metadata: z.record(z.unknown()).optional().default({}),
  actor: z.string().optional().default('user'),
  reason: z.string().optional(),
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

/**
 * Input schema for updating an existing task's mutable fields
 */
export const UpdateTaskInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  agent: TaskAgentSchema.optional(),
  branch: TaskBranchSchema.optional(),
  worktree: TaskWorktreeSchema.optional(),
  pullRequest: TaskPullRequestSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  error: TaskErrorSchema.optional(),
  result: TaskResultSchema.optional(),
});
export type UpdateTaskInput = z.input<typeof UpdateTaskInputSchema>;

/**
 * Input schema for triggering a state transition
 */
export const TransitionTaskInputSchema = z.object({
  status: TaskStatusSchema,
  reason: z.string().optional(),
  actor: z.string().optional().default('system'),
  metadata: z.record(z.unknown()).optional(),
  agent: TaskAgentSchema.optional(),
  branch: TaskBranchSchema.optional(),
  worktree: TaskWorktreeSchema.optional(),
  pullRequest: TaskPullRequestSchema.optional(),
  error: TaskErrorSchema.optional(),
  result: TaskResultSchema.optional(),
});
export type TransitionTaskInput = z.input<typeof TransitionTaskInputSchema>;

/**
 * Schema for filtering and querying tasks
 */
export const TaskFilterSchema = z.object({
  status: z.union([TaskStatusSchema, z.array(TaskStatusSchema)]).optional(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  branchName: z.string().optional(),
  worktreePath: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  query: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'status']).optional().default('createdAt'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type TaskFilter = z.input<typeof TaskFilterSchema>;
