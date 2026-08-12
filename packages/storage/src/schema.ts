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

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    agent_id TEXT,
    session_id TEXT,
    role TEXT,
    model TEXT,
    branch_name TEXT,
    target_branch TEXT,
    worktree_path TEXT,
    is_detached INTEGER DEFAULT 0,
    pr_number INTEGER,
    pr_url TEXT,
    pr_title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    assigned_at TEXT,
    started_at TEXT,
    review_requested_at TEXT,
    approved_at TEXT,
    ready_to_merge_at TEXT,
    merged_at TEXT,
    failed_at TEXT,
    error_json TEXT,
    result_json TEXT,
    metadata_json TEXT,
    task_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_history (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    reason TEXT,
    actor TEXT,
    metadata_json TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_city_session ON events (city_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_city ON sessions (city_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_permits_city_session ON permits (city_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_branch ON tasks(branch_name);
CREATE INDEX IF NOT EXISTS idx_tasks_pr ON tasks(pr_number);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp);
`;
