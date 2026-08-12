import type { Task, TaskFilter, TaskTransitionHistoryEntry } from '@visoagent/protocol';
import { ITaskRepository } from '../types.js';

export class InMemoryTaskRepository implements ITaskRepository {
  private tasks = new Map<string, Task>();
  private historyMap = new Map<string, TaskTransitionHistoryEntry[]>();

  async create(task: Task): Promise<Task> {
    const cloned = structuredClone(task);
    this.tasks.set(task.id, cloned);
    if (task.history && task.history.length > 0) {
      this.historyMap.set(task.id, structuredClone(task.history));
    } else {
      this.historyMap.set(task.id, []);
    }
    return structuredClone(cloned);
  }

  async findById(id: string): Promise<Task | null> {
    const task = this.tasks.get(id);
    if (!task) return null;
    const result = structuredClone(task);
    result.history = structuredClone(this.historyMap.get(id) ?? []);
    return result;
  }

  async update(task: Task): Promise<Task> {
    const existing = this.tasks.get(task.id);
    if (!existing) {
      return this.create(task);
    }
    const cloned = structuredClone(task);
    this.tasks.set(task.id, cloned);
    if (task.history) {
      this.historyMap.set(task.id, structuredClone(task.history));
    }
    return structuredClone(cloned);
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.tasks.delete(id);
    this.historyMap.delete(id);
    return existed;
  }

  async list(filter: TaskFilter = {}): Promise<Task[]> {
    let result = Array.from(this.tasks.values()).map((task) => {
      const cloned = structuredClone(task);
      cloned.history = structuredClone(this.historyMap.get(task.id) ?? []);
      return cloned;
    });

    result = this.applyFilter(result, filter);
    result = this.applySorting(result, filter);
    result = this.applyPagination(result, filter);

    return result;
  }

  async count(filter: TaskFilter = {}): Promise<number> {
    const filtered = this.applyFilter(Array.from(this.tasks.values()), filter);
    return filtered.length;
  }

  async addHistoryEntry(taskId: string, entry: TaskTransitionHistoryEntry): Promise<void> {
    const existing = this.historyMap.get(taskId) ?? [];
    existing.push(structuredClone(entry));
    this.historyMap.set(taskId, existing);

    const task = this.tasks.get(taskId);
    if (task) {
      task.history = structuredClone(existing);
    }
  }

  async getHistory(taskId: string): Promise<TaskTransitionHistoryEntry[]> {
    return structuredClone(this.historyMap.get(taskId) ?? []);
  }

  private applyFilter(tasks: Task[], filter: TaskFilter): Task[] {
    return tasks.filter((task) => {
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(task.status)) return false;
      }

      if (filter.agentId && task.agent?.agentId !== filter.agentId) {
        return false;
      }

      if (filter.sessionId && task.agent?.sessionId !== filter.sessionId) {
        return false;
      }

      if (filter.branchName && task.branch?.name !== filter.branchName) {
        return false;
      }

      if (filter.worktreePath && task.worktree?.path !== filter.worktreePath) {
        return false;
      }

      if (filter.prNumber !== undefined && task.pullRequest?.number !== filter.prNumber) {
        return false;
      }

      if (filter.query) {
        const q = filter.query.toLowerCase();
        const inTitle = task.title.toLowerCase().includes(q);
        const inDesc = task.description.toLowerCase().includes(q);
        if (!inTitle && !inDesc) return false;
      }

      return true;
    });
  }

  private applySorting(tasks: Task[], filter: TaskFilter): Task[] {
    const sortBy = filter.sortBy ?? 'createdAt';
    const direction = filter.sortDirection === 'asc' ? 1 : -1;

    return [...tasks].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (sortBy) {
        case 'title':
          valA = a.title.toLowerCase();
          valB = b.title.toLowerCase();
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'updatedAt':
          valA = new Date(a.timestamps.updatedAt).getTime();
          valB = new Date(b.timestamps.updatedAt).getTime();
          break;
        case 'createdAt':
        default:
          valA = new Date(a.timestamps.createdAt).getTime();
          valB = new Date(b.timestamps.createdAt).getTime();
          break;
      }

      if (valA < valB) return -1 * direction;
      if (valA > valB) return 1 * direction;
      return 0;
    });
  }

  private applyPagination(tasks: Task[], filter: TaskFilter): Task[] {
    const offset = filter.offset ?? 0;
    const limit = filter.limit;

    if (limit !== undefined) {
      return tasks.slice(offset, offset + limit);
    }
    if (offset > 0) {
      return tasks.slice(offset);
    }
    return tasks;
  }
}
