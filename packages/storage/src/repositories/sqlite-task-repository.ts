import type { DatabaseSync } from 'node:sqlite';
import {
  Task,
  TaskFilter,
  TaskTransitionHistoryEntry,
  TaskSchema,
} from '@visoagent/protocol';
import { ITaskRepository } from '../types.js';

interface TaskDbRow {
  id: string;
  title: string;
  description: string;
  status: string;
  agent_id: string | null;
  session_id: string | null;
  role: string | null;
  model: string | null;
  branch_name: string | null;
  target_branch: string | null;
  worktree_path: string | null;
  is_detached: number;
  pr_number: number | null;
  pr_url: string | null;
  pr_title: string | null;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  started_at: string | null;
  review_requested_at: string | null;
  approved_at: string | null;
  ready_to_merge_at: string | null;
  merged_at: string | null;
  failed_at: string | null;
  error_json: string | null;
  result_json: string | null;
  metadata_json: string | null;
  task_json: string;
}

interface TaskHistoryDbRow {
  id: string;
  task_id: string;
  from_status: string | null;
  to_status: string;
  timestamp: string;
  reason: string | null;
  actor: string | null;
  metadata_json: string | null;
}

export class SqliteTaskRepository implements ITaskRepository {
  constructor(private db: DatabaseSync) {}

  async create(task: Task): Promise<Task> {
    const insertTask = this.db.prepare(`
      INSERT INTO tasks (
        id, title, description, status,
        agent_id, session_id, role, model,
        branch_name, target_branch, worktree_path, is_detached,
        pr_number, pr_url, pr_title,
        created_at, updated_at,
        assigned_at, started_at, review_requested_at, approved_at, ready_to_merge_at, merged_at, failed_at,
        error_json, result_json, metadata_json, task_json
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    insertTask.run(
      task.id,
      task.title,
      task.description ?? '',
      task.status,
      task.agent?.agentId ?? null,
      task.agent?.sessionId ?? null,
      task.agent?.role ?? null,
      task.agent?.model ?? null,
      task.branch?.name ?? null,
      task.branch?.targetBranch ?? 'main',
      task.worktree?.path ?? null,
      task.worktree?.isDetached ? 1 : 0,
      task.pullRequest?.number ?? null,
      task.pullRequest?.url ?? null,
      task.pullRequest?.title ?? null,
      task.timestamps.createdAt,
      task.timestamps.updatedAt,
      task.timestamps.assignedAt ?? null,
      task.timestamps.startedAt ?? null,
      task.timestamps.reviewRequestedAt ?? null,
      task.timestamps.approvedAt ?? null,
      task.timestamps.readyToMergeAt ?? null,
      task.timestamps.mergedAt ?? null,
      task.timestamps.failedAt ?? null,
      task.error ? JSON.stringify(task.error) : null,
      task.result ? JSON.stringify(task.result) : null,
      task.metadata ? JSON.stringify(task.metadata) : JSON.stringify({}),
      JSON.stringify(task)
    );

    if (task.history && task.history.length > 0) {
      const insertHistory = this.db.prepare(`
        INSERT OR IGNORE INTO task_history (
          id, task_id, from_status, to_status, timestamp, reason, actor, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entry of task.history) {
        insertHistory.run(
          entry.id,
          task.id,
          entry.fromStatus ?? null,
          entry.toStatus,
          entry.timestamp,
          entry.reason ?? null,
          entry.actor ?? null,
          entry.metadata ? JSON.stringify(entry.metadata) : null
        );
      }
    }

    return this.findById(task.id) as Promise<Task>;
  }

  async findById(id: string): Promise<Task | null> {
    const selectTask = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);

    const row = selectTask.get(id) as unknown as TaskDbRow | undefined;
    if (!row) return null;

    const task = this.rowToTask(row);
    task.history = await this.getHistory(id);
    return task;
  }

  async update(task: Task): Promise<Task> {
    const updateStmt = this.db.prepare(`
      UPDATE tasks SET
        title = ?,
        description = ?,
        status = ?,
        agent_id = ?,
        session_id = ?,
        role = ?,
        model = ?,
        branch_name = ?,
        target_branch = ?,
        worktree_path = ?,
        is_detached = ?,
        pr_number = ?,
        pr_url = ?,
        pr_title = ?,
        updated_at = ?,
        assigned_at = ?,
        started_at = ?,
        review_requested_at = ?,
        approved_at = ?,
        ready_to_merge_at = ?,
        merged_at = ?,
        failed_at = ?,
        error_json = ?,
        result_json = ?,
        metadata_json = ?,
        task_json = ?
      WHERE id = ?
    `);

    updateStmt.run(
      task.title,
      task.description ?? '',
      task.status,
      task.agent?.agentId ?? null,
      task.agent?.sessionId ?? null,
      task.agent?.role ?? null,
      task.agent?.model ?? null,
      task.branch?.name ?? null,
      task.branch?.targetBranch ?? 'main',
      task.worktree?.path ?? null,
      task.worktree?.isDetached ? 1 : 0,
      task.pullRequest?.number ?? null,
      task.pullRequest?.url ?? null,
      task.pullRequest?.title ?? null,
      task.timestamps.updatedAt,
      task.timestamps.assignedAt ?? null,
      task.timestamps.startedAt ?? null,
      task.timestamps.reviewRequestedAt ?? null,
      task.timestamps.approvedAt ?? null,
      task.timestamps.readyToMergeAt ?? null,
      task.timestamps.mergedAt ?? null,
      task.timestamps.failedAt ?? null,
      task.error ? JSON.stringify(task.error) : null,
      task.result ? JSON.stringify(task.result) : null,
      task.metadata ? JSON.stringify(task.metadata) : JSON.stringify({}),
      JSON.stringify(task),
      task.id
    );

    if (task.history && task.history.length > 0) {
      const insertHistory = this.db.prepare(`
        INSERT OR IGNORE INTO task_history (
          id, task_id, from_status, to_status, timestamp, reason, actor, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entry of task.history) {
        insertHistory.run(
          entry.id,
          task.id,
          entry.fromStatus ?? null,
          entry.toStatus,
          entry.timestamp,
          entry.reason ?? null,
          entry.actor ?? null,
          entry.metadata ? JSON.stringify(entry.metadata) : null
        );
      }
    }

    return (await this.findById(task.id)) ?? task;
  }

  async delete(id: string): Promise<boolean> {
    const deleteStmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    deleteStmt.run(id);
    return true;
  }

  async list(filter: TaskFilter = {}): Promise<Task[]> {
    const { queryStr, params } = this.buildFilterQuery(filter, false);
    const selectStmt = this.db.prepare(queryStr);
    const rows = selectStmt.all(...params) as unknown as TaskDbRow[];

    const tasks: Task[] = [];
    for (const row of rows) {
      const task = this.rowToTask(row);
      task.history = await this.getHistory(task.id);
      tasks.push(task);
    }
    return tasks;
  }

  async count(filter: TaskFilter = {}): Promise<number> {
    const { queryStr, params } = this.buildFilterQuery(filter, true);
    const selectStmt = this.db.prepare(queryStr);
    const row = selectStmt.get(...params) as { count: number } | undefined;
    return row ? row.count : 0;
  }

  async addHistoryEntry(taskId: string, entry: TaskTransitionHistoryEntry): Promise<void> {
    const insertHistory = this.db.prepare(`
      INSERT OR REPLACE INTO task_history (
        id, task_id, from_status, to_status, timestamp, reason, actor, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertHistory.run(
      entry.id,
      taskId,
      entry.fromStatus ?? null,
      entry.toStatus,
      entry.timestamp,
      entry.reason ?? null,
      entry.actor ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );
  }

  async getHistory(taskId: string): Promise<TaskTransitionHistoryEntry[]> {
    const selectHistory = this.db.prepare(`
      SELECT * FROM task_history WHERE task_id = ? ORDER BY timestamp ASC
    `);
    const rows = selectHistory.all(taskId) as unknown as TaskHistoryDbRow[];

    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.from_status as Task['status'] | null,
      toStatus: r.to_status as Task['status'],
      timestamp: r.timestamp,
      reason: r.reason ?? undefined,
      actor: r.actor ?? undefined,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
    }));
  }

  private rowToTask(row: TaskDbRow): Task {
    try {
      const parsed = JSON.parse(row.task_json);
      return TaskSchema.parse(parsed);
    } catch {
      // Fallback reconstruction from columns
      return TaskSchema.parse({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        agent: row.agent_id
          ? {
              agentId: row.agent_id,
              sessionId: row.session_id ?? undefined,
              role: row.role ?? undefined,
              model: row.model ?? undefined,
            }
          : undefined,
        branch: row.branch_name
          ? {
              name: row.branch_name,
              targetBranch: row.target_branch ?? 'main',
            }
          : undefined,
        worktree: row.worktree_path
          ? {
              path: row.worktree_path,
              isDetached: Boolean(row.is_detached),
            }
          : undefined,
        pullRequest: row.pr_number
          ? {
              number: row.pr_number,
              url: row.pr_url ?? undefined,
              title: row.pr_title ?? undefined,
            }
          : undefined,
        timestamps: {
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          assignedAt: row.assigned_at ?? undefined,
          startedAt: row.started_at ?? undefined,
          reviewRequestedAt: row.review_requested_at ?? undefined,
          approvedAt: row.approved_at ?? undefined,
          readyToMergeAt: row.ready_to_merge_at ?? undefined,
          mergedAt: row.merged_at ?? undefined,
          failedAt: row.failed_at ?? undefined,
        },
        error: row.error_json ? JSON.parse(row.error_json) : undefined,
        result: row.result_json ? JSON.parse(row.result_json) : undefined,
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
        history: [],
      });
    }
  }

  private buildFilterQuery(
    filter: TaskFilter,
    isCount: boolean
  ): { queryStr: string; params: (string | number)[] } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filter.status);
      } else {
        conditions.push('status = ?');
        params.push(filter.status);
      }
    }

    if (filter.agentId) {
      conditions.push('agent_id = ?');
      params.push(filter.agentId);
    }

    if (filter.sessionId) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }

    if (filter.branchName) {
      conditions.push('branch_name = ?');
      params.push(filter.branchName);
    }

    if (filter.worktreePath) {
      conditions.push('worktree_path = ?');
      params.push(filter.worktreePath);
    }

    if (filter.prNumber !== undefined) {
      conditions.push('pr_number = ?');
      params.push(filter.prNumber);
    }

    if (filter.query) {
      conditions.push('(title LIKE ? OR description LIKE ?)');
      const pattern = `%${filter.query}%`;
      params.push(pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    if (isCount) {
      return {
        queryStr: `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
        params,
      };
    }

    const sortColumnMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title',
      status: 'status',
    };

    const sortByCol = sortColumnMap[filter.sortBy ?? 'createdAt'] ?? 'created_at';
    const sortDir = (filter.sortDirection ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let paginationClause = '';
    if (filter.limit !== undefined) {
      paginationClause += ` LIMIT ${filter.limit}`;
      if (filter.offset !== undefined) {
        paginationClause += ` OFFSET ${filter.offset}`;
      }
    } else if (filter.offset !== undefined) {
      paginationClause += ` LIMIT -1 OFFSET ${filter.offset}`;
    }

    const queryStr = `
      SELECT * FROM tasks
      ${whereClause}
      ORDER BY ${sortByCol} ${sortDir}
      ${paginationClause}
    `;

    return { queryStr, params };
  }
}
