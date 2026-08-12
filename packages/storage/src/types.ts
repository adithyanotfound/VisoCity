import type {
  GameEvent,
  WorldSnapshot,
  Task,
  TaskFilter,
  TaskTransitionHistoryEntry,
} from '@visoagent/protocol';

export type SessionStatus =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'waiting_for_permit'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface SessionRecord {
  id: string;
  cityId: string;
  status: SessionStatus;
  prompt: string;
  model: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  permissionMode?: 'default' | 'auto';
  contextPaths?: string[];
  workingDirectory?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  exitCode?: number | null;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface EventRecord {
  id?: number;
  cityId: string;
  sessionId: string;
  eventType: string;
  eventPayload: GameEvent;
  createdAt: number;
}

export interface PermitRecord {
  permitId: string;
  cityId: string;
  sessionId?: string;
  toolName: string;
  targetPath?: string;
  description?: string;
  status: 'pending' | 'allowed' | 'denied';
  createdAt: number;
  resolvedAt?: number;
}

export interface SnapshotRecord {
  cityId: string;
  repoName: string;
  commitSha: string;
  totalLoc: number;
  snapshot: WorldSnapshot;
  updatedAt: number;
}

export interface StorageOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export interface ITaskRepository {
  create(task: Task): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  update(task: Task): Promise<Task>;
  delete(id: string): Promise<boolean>;
  list(filter?: TaskFilter): Promise<Task[]>;
  count(filter?: TaskFilter): Promise<number>;
  addHistoryEntry(taskId: string, entry: TaskTransitionHistoryEntry): Promise<void>;
  getHistory(taskId: string): Promise<TaskTransitionHistoryEntry[]>;
}

export type TaskEventMap = {
  'task:created': (task: Task) => void;
  'task:updated': (task: Task) => void;
  'task:transitioned': (task: Task, transition: TaskTransitionHistoryEntry) => void;
  'task:deleted': (taskId: string) => void;
};
