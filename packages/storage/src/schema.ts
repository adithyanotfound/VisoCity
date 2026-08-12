export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS snapshots (
    city_id TEXT PRIMARY KEY,
    repo_name TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    total_loc INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS permits (
    permit_id TEXT PRIMARY KEY,
    city_id TEXT NOT NULL,
    session_id TEXT,
    tool_name TEXT NOT NULL,
    target_path TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    city_id TEXT NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT,
    permission_mode TEXT,
    context_paths_json TEXT,
    working_directory TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    error TEXT,
    exit_code INTEGER,
    cost_usd REAL DEFAULT 0.0,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_city_session ON events (city_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_city ON sessions (city_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_permits_city_session ON permits (city_id, session_id);
`;
