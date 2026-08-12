import { GitExecutor } from './executor.js';
import { GitError, InvalidBranchNameError } from './errors.js';

export interface FormatBranchNameOptions {
  sessionId: string;
  agentId?: string;
  taskName?: string;
  prefix?: string;
}

/**
 * Sanitizes a string to conform strictly to git branch naming conventions (ref format rules).
 */
export function sanitizeBranchName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'agent-workspace';
  }

  let sanitized = name
    // Replace @{ sequence first
    .replace(/@\{/g, '-')
    // Replace invalid git ref characters: spaces, ~, ^, :, ?, *, [, \, ], {, }, @
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F\s~^:?*[\\\]{}@]/g, '-')
    .replace(/\.\.+/g, '-')
    // Replace consecutive slashes
    .replace(/\/+/g, '/')
    // Replace consecutive hyphens
    .replace(/-+/g, '-');

  // Strip leading and trailing dots, slashes, and hyphens
  sanitized = sanitized.replace(/^[./-]+|[./-]+$/g, '');

  // Remove .lock at the end of path segments or end of string
  sanitized = sanitized.replace(/\.lock(\/|$)/g, '$1');
  sanitized = sanitized.replace(/^[./-]+|[./-]+$/g, '');

  // If path segments have leading/trailing dots or hyphens: e.g. "agent/.foo" -> "agent/foo"
  sanitized = sanitized
    .split('/')
    .map((seg) => seg.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(Boolean)
    .join('/');

  // Truncate to reasonable max length (e.g. 200 chars)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200).replace(/[./-]+$/, '');
  }

  return sanitized || 'agent-workspace';
}

/**
 * Checks if a branch name is valid according to git ref rules.
 */
export function isValidBranchName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 250) return false;
  if (name.startsWith('/') || name.endsWith('/') || name.startsWith('.') || name.endsWith('.'))
    return false;
  if (name.endsWith('.lock')) return false;
  if (name.includes('..') || name.includes('//') || name.includes('@{')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F\s~^:?*[\\\]]/.test(name)) return false;
  if (name === '@') return false;
  return true;
}

/**
 * Generates a deterministic and safe branch name for an agent workspace.
 */
export function formatAgentBranchName(options: FormatBranchNameOptions): string {
  const prefix = options.prefix ? sanitizeBranchName(options.prefix) : 'agent';
  const cleanSessionId = sanitizeBranchName(options.sessionId);
  const cleanAgentId = options.agentId ? sanitizeBranchName(options.agentId) : undefined;
  const cleanTaskName = options.taskName ? sanitizeBranchName(options.taskName) : undefined;

  const parts: string[] = [prefix];

  if (cleanAgentId && cleanTaskName) {
    parts.push(`${cleanAgentId}-${cleanTaskName}-${cleanSessionId.slice(0, 8)}`);
  } else if (cleanTaskName) {
    parts.push(`${cleanTaskName}-${cleanSessionId.slice(0, 8)}`);
  } else if (cleanAgentId) {
    parts.push(`${cleanAgentId}-${cleanSessionId}`);
  } else {
    parts.push(cleanSessionId);
  }

  const branchName = parts.join('/');
  return sanitizeBranchName(branchName);
}

/**
 * Checks if a branch exists locally in the repository.
 */
export async function branchExists(
  executor: GitExecutor,
  repoPath: string,
  branchName: string,
): Promise<boolean> {
  const result = await executor.exec(['rev-parse', '--verify', `refs/heads/${branchName}`], {
    cwd: repoPath,
    allowNonZeroExit: true,
  });
  return result.exitCode === 0;
}

/**
 * Creates a git branch idempotently from a base ref without checking it out in the current working tree.
 */
export async function createBranch(
  executor: GitExecutor,
  repoPath: string,
  branchName: string,
  baseRef = 'HEAD',
  options?: { force?: boolean },
): Promise<void> {
  const cleanBranch = sanitizeBranchName(branchName);
  if (!isValidBranchName(cleanBranch)) {
    throw new InvalidBranchNameError(branchName);
  }

  const exists = await branchExists(executor, repoPath, cleanBranch);
  if (exists) {
    if (options?.force) {
      await executor.exec(['branch', '-f', cleanBranch, baseRef], { cwd: repoPath });
    }
    return;
  }

  await executor.exec(['branch', cleanBranch, baseRef], { cwd: repoPath });
}

/**
 * Deletes a branch idempotently.
 */
export async function deleteBranch(
  executor: GitExecutor,
  repoPath: string,
  branchName: string,
  force = true,
): Promise<void> {
  const exists = await branchExists(executor, repoPath, branchName);
  if (!exists) {
    return;
  }

  await executor.exec(['branch', force ? '-D' : '-d', branchName], {
    cwd: repoPath,
    allowNonZeroExit: true,
  });
}

/**
 * Gets the current branch name of a working tree / worktree.
 */
export async function getCurrentBranch(executor: GitExecutor, targetPath: string): Promise<string> {
  const result = await executor.exec(['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: targetPath,
  });
  return result.stdout.trim();
}

/**
 * Resolves a git ref (branch, tag, HEAD) to its full 40-character commit SHA.
 */
export async function getCommitSha(
  executor: GitExecutor,
  targetPath: string,
  ref = 'HEAD',
): Promise<string> {
  const result = await executor.exec(['rev-parse', ref], { cwd: targetPath });
  const sha = result.stdout.trim();
  if (!sha || sha.length < 7) {
    throw new GitError(`Failed to resolve commit SHA for ref: ${ref}`, {
      command: 'git rev-parse',
      args: [ref],
      stdout: result.stdout,
    });
  }
  return sha;
}
