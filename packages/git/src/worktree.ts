import path from 'node:path';
import fs from 'node:fs/promises';
import { GitExecutor } from './executor.js';
import { assertNotMainWorkingTree, resolveCanonicalPath } from './guards.js';
import { branchExists, deleteBranch, sanitizeBranchName } from './branch.js';

export interface GitWorktreeInfo {
  path: string;
  headSha: string;
  branch?: string;
  isBare: boolean;
  isDetached: boolean;
  isLocked: boolean;
  lockReason?: string;
  isPrunable: boolean;
  prunableReason?: string;
}

export interface CreateWorktreeOptions {
  repoPath: string;
  worktreePath: string;
  branch?: string;
  baseRef?: string;
  commitSha?: string;
  detach?: boolean;
  force?: boolean;
  createBranch?: boolean;
  lock?: boolean;
  lockReason?: string;
}

export interface RemoveWorktreeOptions {
  force?: boolean;
  deleteBranch?: boolean;
  branchName?: string;
}

/**
 * Parses the porcelain output from `git worktree list --porcelain`.
 */
export function parseWorktreeListPorcelain(output: string): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = [];
  const entries = output.split(/(?:\r?\n){2,}/);

  for (const entry of entries) {
    const lines = entry
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let wtPath = '';
    let headSha = '';
    let branch: string | undefined;
    let isBare = false;
    let isDetached = false;
    let isLocked = false;
    let lockReason: string | undefined;
    let isPrunable = false;
    let prunableReason: string | undefined;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.substring('worktree '.length).trim();
      } else if (line.startsWith('HEAD ')) {
        headSha = line.substring('HEAD '.length).trim();
      } else if (line.startsWith('branch ')) {
        const fullBranch = line.substring('branch '.length).trim();
        branch = fullBranch.replace(/^refs\/heads\//, '');
      } else if (line === 'bare') {
        isBare = true;
      } else if (line === 'detached') {
        isDetached = true;
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true;
        if (line.startsWith('locked ')) {
          lockReason = line.substring('locked '.length).trim();
        }
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        isPrunable = true;
        if (line.startsWith('prunable ')) {
          prunableReason = line.substring('prunable '.length).trim();
        }
      }
    }

    if (wtPath) {
      worktrees.push({
        path: resolveCanonicalPath(wtPath),
        headSha,
        branch,
        isBare,
        isDetached,
        isLocked,
        lockReason,
        isPrunable,
        prunableReason,
      });
    }
  }

  return worktrees;
}

/**
 * Lists all git worktrees for a repository.
 */
export async function listWorktrees(
  executor: GitExecutor,
  repoPath: string,
): Promise<GitWorktreeInfo[]> {
  const result = await executor.exec(['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
  });
  return parseWorktreeListPorcelain(result.stdout);
}

/**
 * Retrieves information for a specific worktree path.
 */
export async function getWorktree(
  executor: GitExecutor,
  repoPath: string,
  worktreePath: string,
): Promise<GitWorktreeInfo | undefined> {
  const worktrees = await listWorktrees(executor, repoPath);
  const targetCanonical = resolveCanonicalPath(worktreePath);
  return worktrees.find((wt) => resolveCanonicalPath(wt.path) === targetCanonical);
}

/**
 * Prunes stale or disconnected worktree records.
 */
export async function pruneWorktrees(executor: GitExecutor, repoPath: string): Promise<void> {
  await executor.exec(['worktree', 'prune'], {
    cwd: repoPath,
    allowNonZeroExit: true,
  });
}

/**
 * Locks a worktree to prevent accidental deletion or pruning.
 */
export async function lockWorktree(
  executor: GitExecutor,
  repoPath: string,
  worktreePath: string,
  reason?: string,
): Promise<void> {
  assertNotMainWorkingTree(repoPath, worktreePath, 'lockWorktree');
  const args = ['worktree', 'lock'];
  if (reason) {
    args.push('--reason', reason);
  }
  args.push(worktreePath);
  await executor.exec(args, { cwd: repoPath });
}

/**
 * Unlocks a locked worktree.
 */
export async function unlockWorktree(
  executor: GitExecutor,
  repoPath: string,
  worktreePath: string,
): Promise<void> {
  assertNotMainWorkingTree(repoPath, worktreePath, 'unlockWorktree');
  await executor.exec(['worktree', 'unlock', worktreePath], {
    cwd: repoPath,
    allowNonZeroExit: true,
  });
}

/**
 * Adds an isolated git worktree with safety checks, idempotency, and recovery for existing paths.
 */
export async function addWorktree(
  executor: GitExecutor,
  options: CreateWorktreeOptions,
): Promise<GitWorktreeInfo> {
  const { repoPath, worktreePath } = options;

  // STRICT GUARD: Guard main working tree
  assertNotMainWorkingTree(repoPath, worktreePath, 'addWorktree');

  const canonicalTarget = resolveCanonicalPath(worktreePath);

  // Check if worktree is already recognized by git
  const existingList = await listWorktrees(executor, repoPath);
  const existing = existingList.find((wt) => resolveCanonicalPath(wt.path) === canonicalTarget);

  if (existing) {
    if (!existing.isPrunable) {
      // Worktree already exists and is active
      return existing;
    }
    // Stale prunable worktree - prune first
    await pruneWorktrees(executor, repoPath);
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(canonicalTarget);
  try {
    await fs.mkdir(parentDir, { recursive: true });
  } catch {
    // Non-fatal if simulated/mock path in unit tests
  }

  // Clean up any untracked or orphaned directory at destination
  try {
    const stat = await fs.stat(canonicalTarget);
    if (stat.isDirectory()) {
      // Attempt removal of stale leftover directory
      await fs.rm(canonicalTarget, { recursive: true, force: true });
    }
  } catch {
    // Directory does not exist, which is expected
  }

  const baseRef = options.baseRef ?? options.commitSha ?? 'HEAD';
  const args: string[] = ['worktree', 'add'];

  if (options.force) {
    args.push('--force');
  }

  if (options.detach) {
    args.push('--detach', canonicalTarget, baseRef);
  } else if (options.branch) {
    const branchName = sanitizeBranchName(options.branch);
    const hasBranch = await branchExists(executor, repoPath, branchName);

    if (options.createBranch ?? true) {
      if (hasBranch) {
        if (options.force) {
          args.push('-B', branchName, canonicalTarget, baseRef);
        } else {
          args.push(canonicalTarget, branchName);
        }
      } else {
        args.push('-b', branchName, canonicalTarget, baseRef);
      }
    } else {
      args.push(canonicalTarget, branchName);
    }
  } else {
    // Default: detached HEAD from baseRef
    args.push('--detach', canonicalTarget, baseRef);
  }

  await executor.exec(args, { cwd: repoPath });

  if (options.lock) {
    try {
      await lockWorktree(executor, repoPath, canonicalTarget, options.lockReason);
    } catch {
      // Non-fatal lock attempt
    }
  }

  const updatedList = await listWorktrees(executor, repoPath);
  const created = updatedList.find((wt) => resolveCanonicalPath(wt.path) === canonicalTarget);

  if (created) {
    return created;
  }

  return {
    path: canonicalTarget,
    headSha: baseRef,
    branch: options.branch ? sanitizeBranchName(options.branch) : undefined,
    isBare: false,
    isDetached: options.detach ?? false,
    isLocked: options.lock ?? false,
    lockReason: options.lockReason,
    isPrunable: false,
  };
}

/**
 * Removes an isolated git worktree safely and prunes git tracking.
 */
export async function removeWorktree(
  executor: GitExecutor,
  repoPath: string,
  worktreePath: string,
  options: RemoveWorktreeOptions = {},
): Promise<void> {
  // STRICT GUARD: Guard main working tree
  assertNotMainWorkingTree(repoPath, worktreePath, 'removeWorktree');

  const canonicalTarget = resolveCanonicalPath(worktreePath);

  // Unlock if locked
  await unlockWorktree(executor, repoPath, canonicalTarget);

  // Remove via git worktree remove
  await executor.exec(['worktree', 'remove', '--force', canonicalTarget], {
    cwd: repoPath,
    allowNonZeroExit: true,
  });

  // Prune worktree records
  await pruneWorktrees(executor, repoPath);

  // Safely ensure directory is deleted if git left untracked files
  try {
    await fs.rm(canonicalTarget, { recursive: true, force: true });
  } catch {
    // Ignore if already deleted
  }

  // Delete branch if requested
  if (options.deleteBranch && options.branchName) {
    const cleanBranch = sanitizeBranchName(options.branchName);
    // Never delete main/master branch
    if (cleanBranch !== 'main' && cleanBranch !== 'master') {
      await deleteBranch(executor, repoPath, cleanBranch, true);
    }
  }
}

/**
 * Checks if a given directory is an active git worktree.
 */
export async function isWorktreePath(executor: GitExecutor, targetPath: string): Promise<boolean> {
  try {
    const result = await executor.exec(['rev-parse', '--is-inside-work-tree'], {
      cwd: targetPath,
      allowNonZeroExit: true,
    });
    return result.exitCode === 0 && result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}
