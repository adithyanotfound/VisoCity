import type { GameEvent, WorldSnapshot } from '@visoagent/protocol';

export type SessionStatus =
  'idle' | 'initializing' | 'running' | 'waiting_for_permit' | 'completed' | 'failed' | 'aborted';

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
}
