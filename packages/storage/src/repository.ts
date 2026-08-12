import { DatabaseSync } from 'node:sqlite';
import type { GameEvent, WorldSnapshot } from '@visoagent/protocol';
import { createSqliteDatabase } from './db.js';
import type {
  EventRecord,
  PermitRecord,
  SessionRecord,
  SessionStatus,
  SnapshotRecord,
  StorageOptions,
} from './types.js';

interface SessionRow {
  id: string;
  city_id: string;
  status: string;
  prompt: string;
  model: string;
  effort: string | null;
  permission_mode: string | null;
  context_paths_json: string | null;
  working_directory: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  exit_code: number | null;
  cost_usd: number | null;
  metadata_json: string | null;
}

interface EventRow {
  id: number;
  city_id: string;
  session_id: string;
  event_type: string;
  event_payload: string;
  created_at: number;
}

interface PermitRow {
  permit_id: string;
  city_id: string;
  session_id: string | null;
  tool_name: string;
  target_path: string | null;
  description: string | null;
  status: string;
  created_at: number;
  resolved_at: number | null;
}

interface SnapshotRow {
  city_id: string;
  repo_name: string;
  commit_sha: string;
  total_loc: number;
  snapshot_json: string;
  updated_at: number;
}

export class StorageRepository {
  private db: DatabaseSync;

  constructor(options: StorageOptions | DatabaseSync = {}) {
    if (options instanceof DatabaseSync) {
      this.db = options;
    } else {
      this.db = createSqliteDatabase(options.dbPath);
    }
  }

  public getDatabase(): DatabaseSync {
    return this.db;
  }

  public close(): void {
    this.db.close();
  }

  // ==========================================
  // Sessions Management
  // ==========================================

  public saveSession(session: SessionRecord): SessionRecord {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, city_id, status, prompt, model, effort, permission_mode,
        context_paths_json, working_directory, created_at, started_at,
        completed_at, error, exit_code, cost_usd, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        city_id = excluded.city_id,
        status = excluded.status,
        prompt = excluded.prompt,
        model = excluded.model,
        effort = excluded.effort,
        permission_mode = excluded.permission_mode,
        context_paths_json = excluded.context_paths_json,
        working_directory = excluded.working_directory,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        error = excluded.error,
        exit_code = excluded.exit_code,
        cost_usd = excluded.cost_usd,
        metadata_json = excluded.metadata_json
    `);

    stmt.run(
      session.id,
      session.cityId,
      session.status,
      session.prompt,
      session.model,
      session.effort ?? null,
      session.permissionMode ?? null,
      session.contextPaths ? JSON.stringify(session.contextPaths) : null,
      session.workingDirectory ?? null,
      session.createdAt,
      session.startedAt ?? null,
      session.completedAt ?? null,
      session.error ?? null,
      session.exitCode ?? null,
      session.costUsd ?? 0.0,
      session.metadata ? JSON.stringify(session.metadata) : null,
    );

    return session;
  }

  public getSession(sessionId: string): SessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(sessionId) as unknown as SessionRow | undefined;
    if (!row) {
      return null;
    }
    return this.mapSessionRow(row);
  }

  public updateSession(sessionId: string, updates: Partial<SessionRecord>): SessionRecord | null {
    const current = this.getSession(sessionId);
    if (!current) {
      return null;
    }

    const updated: SessionRecord = {
      ...current,
      ...updates,
      id: sessionId, // prevent ID change
    };

    return this.saveSession(updated);
  }

  public listSessions(filter?: { cityId?: string; status?: SessionStatus }): SessionRecord[] {
    let sql = 'SELECT * FROM sessions';
    const conditions: string[] = [];
    const params: string[] = [];

    if (filter?.cityId) {
      conditions.push('city_id = ?');
      params.push(filter.cityId);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = (stmt.all(...params) as unknown as SessionRow[]) || [];
    return rows.map((r) => this.mapSessionRow(r));
  }

  public deleteSession(sessionId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(sessionId);
    return Number(result.changes) > 0;
  }

  // ==========================================
  // Events Management
  // ==========================================

  public recordEvent(cityId: string, sessionId: string, event: GameEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (city_id, session_id, event_type, event_payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(cityId, sessionId, event.type, JSON.stringify(event), Date.now());
  }

  public getEvents(cityId: string, sessionId?: string): GameEvent[] {
    let sql = 'SELECT * FROM events WHERE city_id = ?';
    const params: string[] = [cityId];

    if (sessionId) {
      sql += ' AND session_id = ?';
      params.push(sessionId);
    }
    sql += ' ORDER BY id ASC';

    const stmt = this.db.prepare(sql);
    const rows = (stmt.all(...params) as unknown as EventRow[]) || [];
    return rows.map((row) => {
      try {
        return JSON.parse(row.event_payload) as GameEvent;
      } catch {
        return {
          type: 'error',
          message: 'Failed to parse stored event payload',
        } as unknown as GameEvent;
      }
    });
  }

  public getEventRecords(cityId: string, sessionId?: string): EventRecord[] {
    let sql = 'SELECT * FROM events WHERE city_id = ?';
    const params: string[] = [cityId];

    if (sessionId) {
      sql += ' AND session_id = ?';
      params.push(sessionId);
    }
    sql += ' ORDER BY id ASC';

    const stmt = this.db.prepare(sql);
    const rows = (stmt.all(...params) as unknown as EventRow[]) || [];
    return rows.map((row) => ({
      id: row.id,
      cityId: row.city_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      eventPayload: JSON.parse(row.event_payload) as GameEvent,
      createdAt: row.created_at,
    }));
  }

  // ==========================================
  // Permits Management
  // ==========================================

  public savePermit(permit: PermitRecord): PermitRecord {
    const stmt = this.db.prepare(`
      INSERT INTO permits (
        permit_id, city_id, session_id, tool_name, target_path, description, status, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(permit_id) DO UPDATE SET
        city_id = excluded.city_id,
        session_id = excluded.session_id,
        tool_name = excluded.tool_name,
        target_path = excluded.target_path,
        description = excluded.description,
        status = excluded.status,
        resolved_at = excluded.resolved_at
    `);

    stmt.run(
      permit.permitId,
      permit.cityId,
      permit.sessionId ?? null,
      permit.toolName,
      permit.targetPath ?? null,
      permit.description ?? null,
      permit.status,
      permit.createdAt,
      permit.resolvedAt ?? null,
    );

    return permit;
  }

  public getPermit(permitId: string): PermitRecord | null {
    const stmt = this.db.prepare('SELECT * FROM permits WHERE permit_id = ?');
    const row = stmt.get(permitId) as unknown as PermitRow | undefined;
    if (!row) {
      return null;
    }
    return this.mapPermitRow(row);
  }

  public updatePermit(permitId: string, updates: Partial<PermitRecord>): PermitRecord | null {
    const current = this.getPermit(permitId);
    if (!current) {
      return null;
    }
    const updated: PermitRecord = {
      ...current,
      ...updates,
      permitId,
    };
    return this.savePermit(updated);
  }

  public listPermits(filter?: {
    cityId?: string;
    sessionId?: string;
    status?: 'pending' | 'allowed' | 'denied';
  }): PermitRecord[] {
    let sql = 'SELECT * FROM permits';
    const conditions: string[] = [];
    const params: string[] = [];

    if (filter?.cityId) {
      conditions.push('city_id = ?');
      params.push(filter.cityId);
    }
    if (filter?.sessionId) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = (stmt.all(...params) as unknown as PermitRow[]) || [];
    return rows.map((r) => this.mapPermitRow(r));
  }

  // ==========================================
  // Snapshots Management
  // ==========================================

  public saveSnapshot(snapshotRecord: SnapshotRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (city_id, repo_name, commit_sha, total_loc, snapshot_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(city_id) DO UPDATE SET
        repo_name = excluded.repo_name,
        commit_sha = excluded.commit_sha,
        total_loc = excluded.total_loc,
        snapshot_json = excluded.snapshot_json,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      snapshotRecord.cityId,
      snapshotRecord.repoName,
      snapshotRecord.commitSha,
      snapshotRecord.totalLoc,
      JSON.stringify(snapshotRecord.snapshot),
      snapshotRecord.updatedAt,
    );
  }

  public getSnapshot(cityId: string): SnapshotRecord | null {
    const stmt = this.db.prepare('SELECT * FROM snapshots WHERE city_id = ?');
    const row = stmt.get(cityId) as unknown as SnapshotRow | undefined;
    if (!row) {
      return null;
    }
    return {
      cityId: row.city_id,
      repoName: row.repo_name,
      commitSha: row.commit_sha,
      totalLoc: row.total_loc,
      snapshot: JSON.parse(row.snapshot_json) as WorldSnapshot,
      updatedAt: row.updated_at,
    };
  }

  // ==========================================
  // Private Helper Mappers
  // ==========================================

  private mapSessionRow(row: SessionRow): SessionRecord {
    return {
      id: row.id,
      cityId: row.city_id,
      status: row.status as SessionStatus,
      prompt: row.prompt,
      model: row.model,
      effort: (row.effort as 'low' | 'medium' | 'high' | 'max') ?? undefined,
      permissionMode: (row.permission_mode as 'default' | 'auto') ?? undefined,
      contextPaths: row.context_paths_json
        ? (JSON.parse(row.context_paths_json) as string[])
        : undefined,
      workingDirectory: row.working_directory ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      error: row.error ?? undefined,
      exitCode: row.exit_code !== null ? row.exit_code : undefined,
      costUsd: row.cost_usd ?? 0.0,
      metadata: row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : undefined,
    };
  }

  private mapPermitRow(row: PermitRow): PermitRecord {
    return {
      permitId: row.permit_id,
      cityId: row.city_id,
      sessionId: row.session_id ?? undefined,
      toolName: row.tool_name,
      targetPath: row.target_path ?? undefined,
      description: row.description ?? undefined,
      status: row.status as 'pending' | 'allowed' | 'denied',
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
    };
  }
}
