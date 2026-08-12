import path from 'node:path';
import fs from 'node:fs/promises';
import { GitExecutor, DefaultGitExecutor } from './executor.js';
import { SessionNotFoundError } from './errors.js';
import { assertNotMainWorkingTree, resolveCanonicalPath } from './guards.js';
import { createBranch, formatAgentBranchName, getCommitSha, sanitizeBranchName } from './branch.js';
import { addWorktree, listWorktrees, removeWorktree, isWorktreePath } from './worktree.js';
import {
  getChangedFiles,
  getDiff,
  getWorktreeStatus,
  GetChangedFilesOptions,
  GetDiffOptions,
  WorktreeStatusResult,
} from './diff.js';
import { commitWorktreeChanges, CommitResult, CommitWorktreeOptions } from './commit.js';
import { pushWorktreeBranch, PushResult, PushWorktreeOptions } from './push.js';
import { FileDiffEntry } from '@visoagent/protocol';

export type WorkspaceStatus = 'active' | 'completed' | 'failed' | 'abandoned' | 'cleaned';

export interface AgentWorkspace {
  sessionId: string;
  agentId?: string;
  taskName?: string;
  repoPath: string;
  worktreePath: string;
  branchName: string;
  baseRef: string;
  baseSha: string;
  status: WorkspaceStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface CreateAgentWorkspaceOptions {
  repoPath: string;
  sessionId: string;
  agentId?: string;
  taskName?: string;
  baseRef?: string;
  worktreeRootDir?: string;
  branchPrefix?: string;
  branchName?: string;
  detach?: boolean;
  force?: boolean;
  lock?: boolean;
  lockReason?: string;
  metadata?: Record<string, unknown>;
}

export interface CleanupWorkspaceOptions {
  deleteBranch?: boolean;
  force?: boolean;
}

export interface RecoverAbandonedOptions {
  worktreeRootDir?: string;
  maxAgeMs?: number;
  force?: boolean;
  deleteBranches?: boolean;
}

export interface CleanupSummary {
  cleanedCount: number;
  cleanedWorktrees: string[];
  errors: Array<{ path: string; error: string }>;
}

export class AgentWorktreeService {
  private readonly executor: GitExecutor;
  private readonly workspaces = new Map<string, AgentWorkspace>();

  constructor(executor?: GitExecutor) {
    this.executor = executor ?? new DefaultGitExecutor();
  }

  /**
   * Returns the underlying GitExecutor.
   */
  getExecutor(): GitExecutor {
    return this.executor;
  }

  /**
   * Creates an isolated git worktree associated with an agent session.
   * This operation is idempotent and strictly isolates the agent from the main working tree.
   */
  async createWorkspace(options: CreateAgentWorkspaceOptions): Promise<AgentWorkspace> {
    const canonicalRepo = resolveCanonicalPath(options.repoPath);

    // Validate that repo is a valid git repository
    await this.executor.exec(['rev-parse', '--git-dir'], { cwd: canonicalRepo });

    const sessionId = options.sessionId;
    const baseRef = options.baseRef ?? 'HEAD';
    const baseSha = await getCommitSha(this.executor, canonicalRepo, baseRef);

    // Generate deterministic branch name
    const branchName = options.branchName
      ? sanitizeBranchName(options.branchName)
      : formatAgentBranchName({
          sessionId,
          agentId: options.agentId,
          taskName: options.taskName,
          prefix: options.branchPrefix ?? 'agent',
        });

    // Compute isolated worktree directory
    const worktreeRootDir = options.worktreeRootDir
      ? resolveCanonicalPath(options.worktreeRootDir)
      : path.join(canonicalRepo, '.visocity', 'worktrees');

    const cleanSessionFolder = sanitizeBranchName(sessionId).replace(/\//g, '-');
    const worktreePath = path.join(worktreeRootDir, cleanSessionFolder);

    // STRICT GUARD: Ensure target path is never the main working tree
    assertNotMainWorkingTree(canonicalRepo, worktreePath, 'createWorkspace');

    // Check if we already have an active workspace registered in memory
    const existing = this.workspaces.get(sessionId);
    if (existing && existing.status === 'active') {
      const isAlive = await isWorktreePath(this.executor, existing.worktreePath);
      if (isAlive) {
        return existing;
      }
    }

    // Create branch from baseSha if not detached
    if (!options.detach) {
      await createBranch(this.executor, canonicalRepo, branchName, baseSha, {
        force: options.force,
      });
    }

    // Add isolated worktree
    await addWorktree(this.executor, {
      repoPath: canonicalRepo,
      worktreePath,
      branch: options.detach ? undefined : branchName,
      baseRef: baseSha,
      detach: options.detach,
      force: options.force ?? true,
      createBranch: false,
      lock: options.lock,
      lockReason: options.lockReason,
    });

    const now = Date.now();
    const workspace: AgentWorkspace = {
      sessionId,
      agentId: options.agentId,
      taskName: options.taskName,
      repoPath: canonicalRepo,
      worktreePath: resolveCanonicalPath(worktreePath),
      branchName,
      baseRef,
      baseSha,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata,
    };

    this.workspaces.set(sessionId, workspace);
    return workspace;
  }

  /**
   * Retrieves an active or tracked workspace by session ID.
   */
  getWorkspace(sessionId: string): AgentWorkspace | undefined {
    return this.workspaces.get(sessionId);
  }

  /**
   * Lists all registered agent workspaces, optionally filtered.
   */
  listWorkspaces(filter?: { status?: WorkspaceStatus; repoPath?: string }): AgentWorkspace[] {
    const list = Array.from(this.workspaces.values());
    return list.filter((ws) => {
      if (filter?.status && ws.status !== filter.status) return false;
      if (filter?.repoPath && ws.repoPath !== resolveCanonicalPath(filter.repoPath)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Inspects working tree status of a session workspace.
   */
  async detectWorkspaceChanges(sessionId: string): Promise<WorktreeStatusResult> {
    const workspace = this.getRequiredWorkspace(sessionId);
    assertNotMainWorkingTree(workspace.repoPath, workspace.worktreePath, 'detectWorkspaceChanges');
    return await getWorktreeStatus(this.executor, workspace.worktreePath);
  }

  /**
   * Retrieves changed files compared to base ref or unstaged working tree changes.
   */
  async getWorkspaceChangedFiles(
    sessionId: string,
    options?: GetChangedFilesOptions,
  ): Promise<FileDiffEntry[]> {
    const workspace = this.getRequiredWorkspace(sessionId);
    assertNotMainWorkingTree(
      workspace.repoPath,
      workspace.worktreePath,
      'getWorkspaceChangedFiles',
    );
    return await getChangedFiles(this.executor, workspace.worktreePath, {
      baseRef: options?.baseRef ?? workspace.baseSha,
      includeUntracked: options?.includeUntracked ?? true,
    });
  }

  /**
   * Retrieves unified diff output for a workspace.
   */
  async getWorkspaceDiff(sessionId: string, options: GetDiffOptions = {}): Promise<string> {
    const workspace = this.getRequiredWorkspace(sessionId);
    assertNotMainWorkingTree(workspace.repoPath, workspace.worktreePath, 'getWorkspaceDiff');
    return await getDiff(this.executor, workspace.worktreePath, {
      baseRef: options.baseRef ?? workspace.baseSha,
      filePath: options.filePath,
      staged: options.staged,
    });
  }

  /**
   * Commits all changes in the isolated workspace.
   */
  async commitWorkspaceChanges(
    sessionId: string,
    message: string,
    options: Omit<CommitWorktreeOptions, 'message'> = {},
  ): Promise<CommitResult> {
    const workspace = this.getRequiredWorkspace(sessionId);
    assertNotMainWorkingTree(workspace.repoPath, workspace.worktreePath, 'commitWorkspaceChanges');

    const result = await commitWorktreeChanges(
      this.executor,
      workspace.repoPath,
      workspace.worktreePath,
      {
        ...options,
        message,
      },
    );

    workspace.updatedAt = Date.now();
    return result;
  }

  /**
   * Pushes the active workspace branch to the remote repository.
   */
  async pushWorkspaceBranch(
    sessionId: string,
    options: PushWorktreeOptions = {},
  ): Promise<PushResult> {
    const workspace = this.getRequiredWorkspace(sessionId);
    assertNotMainWorkingTree(workspace.repoPath, workspace.worktreePath, 'pushWorkspaceBranch');

    const result = await pushWorktreeBranch(
      this.executor,
      workspace.repoPath,
      workspace.worktreePath,
      {
        branch: workspace.branchName,
        ...options,
      },
    );

    workspace.updatedAt = Date.now();
    return result;
  }

  /**
   * Safely cleans up a session workspace and removes its worktree.
   */
  async cleanupWorkspace(sessionId: string, options: CleanupWorkspaceOptions = {}): Promise<void> {
    const workspace = this.workspaces.get(sessionId);
    if (!workspace) {
      return;
    }

    assertNotMainWorkingTree(workspace.repoPath, workspace.worktreePath, 'cleanupWorkspace');

    await removeWorktree(this.executor, workspace.repoPath, workspace.worktreePath, {
      force: options.force ?? true,
      deleteBranch: options.deleteBranch,
      branchName: workspace.branchName,
    });

    workspace.status = 'cleaned';
    workspace.updatedAt = Date.now();
  }

  /**
   * Safely handles an agent session failure.
   */
  async markSessionFailed(
    sessionId: string,
    error?: Error | string,
    options?: { cleanup?: boolean; deleteBranch?: boolean },
  ): Promise<void> {
    const workspace = this.workspaces.get(sessionId);
    if (!workspace) {
      return;
    }

    workspace.status = 'failed';
    workspace.error = error instanceof Error ? error.message : error;
    workspace.updatedAt = Date.now();

    if (options?.cleanup) {
      await this.cleanupWorkspace(sessionId, {
        deleteBranch: options.deleteBranch ?? false,
      });
    }
  }

  /**
   * Marks a session as abandoned.
   */
  markSessionAbandoned(sessionId: string): void {
    const workspace = this.workspaces.get(sessionId);
    if (workspace) {
      workspace.status = 'abandoned';
      workspace.updatedAt = Date.now();
    }
  }

  /**
   * Safely scans, unlocks, and cleans up orphaned or abandoned worktrees.
   */
  async recoverAbandonedSessions(
    repoPath: string,
    options: RecoverAbandonedOptions = {},
  ): Promise<CleanupSummary> {
    const canonicalRepo = resolveCanonicalPath(repoPath);
    const worktreeRootDir = options.worktreeRootDir
      ? resolveCanonicalPath(options.worktreeRootDir)
      : path.join(canonicalRepo, '.visocity', 'worktrees');

    const summary: CleanupSummary = {
      cleanedCount: 0,
      cleanedWorktrees: [],
      errors: [],
    };

    const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours default
    const now = Date.now();

    // 1. Check registered in-memory workspaces that are abandoned, failed, or expired
    for (const [sessionId, ws] of this.workspaces.entries()) {
      if (ws.repoPath !== canonicalRepo) continue;

      const isExpired = now - ws.createdAt > maxAgeMs;
      const isFailedOrAbandoned = ws.status === 'failed' || ws.status === 'abandoned';

      if (isExpired || isFailedOrAbandoned) {
        try {
          await this.cleanupWorkspace(sessionId, {
            deleteBranch: options.deleteBranches ?? false,
          });
          summary.cleanedCount++;
          summary.cleanedWorktrees.push(ws.worktreePath);
        } catch (err) {
          summary.errors.push({
            path: ws.worktreePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // 2. Discover worktrees from git porcelain list that reside in worktreeRootDir
    try {
      const worktreeList = await listWorktrees(this.executor, canonicalRepo);
      for (const wt of worktreeList) {
        const canonicalWtPath = resolveCanonicalPath(wt.path);

        // Guard: never clean main repo
        if (canonicalWtPath === canonicalRepo) continue;

        // Check if inside worktreeRootDir
        const relative = path.relative(worktreeRootDir, canonicalWtPath);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          // Check if this worktree belongs to an active in-memory session
          const activeWorkspace = Array.from(this.workspaces.values()).find(
            (ws) => ws.worktreePath === canonicalWtPath && ws.status === 'active',
          );

          if (!activeWorkspace) {
            try {
              await removeWorktree(this.executor, canonicalRepo, canonicalWtPath, {
                force: true,
                deleteBranch: options.deleteBranches && wt.branch ? true : false,
                branchName: wt.branch,
              });
              summary.cleanedCount++;
              summary.cleanedWorktrees.push(canonicalWtPath);
            } catch (err) {
              summary.errors.push({
                path: canonicalWtPath,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }
    } catch (err) {
      summary.errors.push({
        path: canonicalRepo,
        error: `Failed to query git worktree list: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 3. Clean any orphaned directories in worktreeRootDir that are not valid worktrees
    try {
      const entries = await fs.readdir(worktreeRootDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(worktreeRootDir, entry.name);
          const canonicalDir = resolveCanonicalPath(dirPath);

          // Check if active session
          const isActive = Array.from(this.workspaces.values()).some(
            (ws) => ws.worktreePath === canonicalDir && ws.status === 'active',
          );

          if (!isActive) {
            try {
              await fs.rm(canonicalDir, { recursive: true, force: true });
              if (!summary.cleanedWorktrees.includes(canonicalDir)) {
                summary.cleanedCount++;
                summary.cleanedWorktrees.push(canonicalDir);
              }
            } catch (err) {
              summary.errors.push({
                path: canonicalDir,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }
    } catch {
      // Worktree root directory might not exist
    }

    return summary;
  }

  /**
   * Cleans up all managed workspaces for a given repository.
   */
  async cleanupAll(
    repoPath: string,
    options: { deleteBranches?: boolean; worktreeRootDir?: string } = {},
  ): Promise<number> {
    const summary = await this.recoverAbandonedSessions(repoPath, {
      maxAgeMs: 0, // Clean all
      deleteBranches: options.deleteBranches ?? false,
      worktreeRootDir: options.worktreeRootDir,
    });
    return summary.cleanedCount;
  }

  private getRequiredWorkspace(sessionId: string): AgentWorkspace {
    const workspace = this.workspaces.get(sessionId);
    if (!workspace) {
      throw new SessionNotFoundError(sessionId);
    }
    return workspace;
  }
}

// Alias for convenience / architecture doc alignment
export const AgentWorktreeManager = AgentWorktreeService;
