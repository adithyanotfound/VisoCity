import { GitExecutor } from './executor.js';
import { FileDiffEntry, FileDiffStatus } from '@visoagent/protocol';

export interface GitFileStatus {
  path: string;
  stagedStatus?: string;
  unstagedStatus?: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
  oldPath?: string;
}

export interface WorktreeStatusResult {
  isClean: boolean;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  totalChanged: number;
}

export interface GetDiffOptions {
  filePath?: string;
  baseRef?: string;
  staged?: boolean;
}

export interface GetChangedFilesOptions {
  baseRef?: string;
  includeUntracked?: boolean;
}

/**
 * Parses git status --porcelain v1 output.
 */
export function parseGitStatusPorcelain(output: string): {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
} {
  const staged: GitFileStatus[] = [];
  const unstaged: GitFileStatus[] = [];
  const untracked: string[] = [];

  const lines = output.split(/\r?\n/).filter((line) => line.length >= 3);

  for (const line of lines) {
    const code = line.substring(0, 2);
    let filePath = line.substring(3).trim();
    let oldPath: string | undefined;

    // Handle quoted paths (e.g. "path/with spaces/file.txt")
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1);
    }

    // Handle rename format: "old/path.ts -> new/path.ts"
    if (filePath.includes(' -> ')) {
      const [from, to] = filePath.split(' -> ');
      oldPath = from.trim().replace(/^"|"$/g, '');
      filePath = to.trim().replace(/^"|"$/g, '');
    }

    const indexStatus = code[0];
    const worktreeStatus = code[1];

    if (code === '??') {
      untracked.push(filePath);
      continue;
    }

    if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
      staged.push({
        path: filePath,
        stagedStatus: indexStatus,
        isStaged: true,
        isUnstaged: false,
        isUntracked: false,
        oldPath,
      });
    }

    if (worktreeStatus && worktreeStatus !== ' ' && worktreeStatus !== '?') {
      unstaged.push({
        path: filePath,
        unstagedStatus: worktreeStatus,
        isStaged: false,
        isUnstaged: true,
        isUntracked: false,
        oldPath,
      });
    }
  }

  return { staged, unstaged, untracked };
}

/**
 * Maps raw git status letters (A, M, D, R, etc.) to protocol FileDiffStatus.
 */
export function mapGitStatusToFileDiffStatus(statusCode: string): FileDiffStatus {
  const code = statusCode.trim().toUpperCase()[0];
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'M':
    case 'T':
    case 'C':
    default:
      return 'modified';
  }
}

/**
 * Parses `git diff --numstat` output into FileDiffEntry records.
 */
export function parseGitNumstat(
  output: string,
): Map<string, { insertions: number; deletions: number; oldPath?: string }> {
  const result = new Map<string, { insertions: number; deletions: number; oldPath?: string }>();
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const [insStr, delStr, rawPath] = parts;
    const insertions = insStr === '-' ? 0 : parseInt(insStr, 10) || 0;
    const deletions = delStr === '-' ? 0 : parseInt(delStr, 10) || 0;

    let targetPath = rawPath;
    let oldPath: string | undefined;

    // Check for renamed format like "src/{old => new}.ts" or "old.ts => new.ts"
    if (rawPath.includes(' => ')) {
      if (rawPath.includes('{') && rawPath.includes('}')) {
        const match = rawPath.match(/(.*)\{(.*) => (.*)\}(.*)/);
        if (match) {
          const [, prefix, from, to, suffix] = match;
          oldPath = `${prefix}${from}${suffix}`.replace(/\/+/g, '/');
          targetPath = `${prefix}${to}${suffix}`.replace(/\/+/g, '/');
        }
      } else {
        const [from, to] = rawPath.split(' => ');
        oldPath = from.trim();
        targetPath = to.trim();
      }
    }

    result.set(targetPath, { insertions, deletions, oldPath });
  }

  return result;
}

/**
 * Parses `git diff --name-status` output.
 */
export function parseGitNameStatus(
  output: string,
): Array<{ path: string; status: FileDiffStatus; oldPath?: string }> {
  const entries: Array<{ path: string; status: FileDiffStatus; oldPath?: string }> = [];
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const rawStatus = parts[0].trim();
    const status = mapGitStatusToFileDiffStatus(rawStatus);

    if (parts.length >= 3 && (status === 'renamed' || rawStatus.startsWith('R'))) {
      const oldPath = parts[1].trim();
      const path = parts[2].trim();
      entries.push({ path, status, oldPath });
    } else {
      const path = parts[1].trim();
      entries.push({ path, status });
    }
  }

  return entries;
}

/**
 * Inspects working tree status for unstaged, staged, and untracked changes.
 */
export async function getWorktreeStatus(
  executor: GitExecutor,
  worktreePath: string,
): Promise<WorktreeStatusResult> {
  const result = await executor.exec(['status', '--porcelain=v1', '-uall'], {
    cwd: worktreePath,
  });

  const { staged, unstaged, untracked } = parseGitStatusPorcelain(result.stdout);
  const totalChanged = staged.length + unstaged.length + untracked.length;
  const isClean = totalChanged === 0;

  return {
    isClean,
    staged,
    unstaged,
    untracked,
    totalChanged,
  };
}

/**
 * Computes changed files and diff metrics compared to a base ref or against working tree.
 */
export async function getChangedFiles(
  executor: GitExecutor,
  worktreePath: string,
  options: GetChangedFilesOptions = {},
): Promise<FileDiffEntry[]> {
  const baseRef = options.baseRef;
  const includeUntracked = options.includeUntracked ?? true;

  const diffArgs = baseRef
    ? ['diff', '--name-status', `${baseRef}...HEAD`]
    : ['diff', '--name-status', 'HEAD'];

  const numstatArgs = baseRef
    ? ['diff', '--numstat', `${baseRef}...HEAD`]
    : ['diff', '--numstat', 'HEAD'];

  // Run diff queries (with fallback if HEAD does not exist yet)
  const [nameStatusRes, numstatRes] = await Promise.all([
    executor.exec(diffArgs, { cwd: worktreePath, allowNonZeroExit: true }),
    executor.exec(numstatArgs, { cwd: worktreePath, allowNonZeroExit: true }),
  ]);

  const nameEntries = parseGitNameStatus(nameStatusRes.stdout);
  const numstatMap = parseGitNumstat(numstatRes.stdout);

  const entryMap = new Map<string, FileDiffEntry>();

  for (const item of nameEntries) {
    const numstat = numstatMap.get(item.path);
    entryMap.set(item.path, {
      path: item.path,
      status: item.status,
      insertions: numstat?.insertions ?? 0,
      deletions: numstat?.deletions ?? 0,
      oldPath: item.oldPath ?? numstat?.oldPath,
    });
  }

  // Also include working tree uncommitted changes if no baseRef was requested or if checking local changes
  const status = await getWorktreeStatus(executor, worktreePath);

  for (const stagedItem of status.staged) {
    if (!entryMap.has(stagedItem.path)) {
      entryMap.set(stagedItem.path, {
        path: stagedItem.path,
        status: mapGitStatusToFileDiffStatus(stagedItem.stagedStatus ?? 'M'),
        insertions: 0,
        deletions: 0,
        oldPath: stagedItem.oldPath,
      });
    }
  }

  for (const unstagedItem of status.unstaged) {
    if (!entryMap.has(unstagedItem.path)) {
      entryMap.set(unstagedItem.path, {
        path: unstagedItem.path,
        status: mapGitStatusToFileDiffStatus(unstagedItem.unstagedStatus ?? 'M'),
        insertions: 0,
        deletions: 0,
        oldPath: unstagedItem.oldPath,
      });
    }
  }

  if (includeUntracked) {
    for (const untrackedPath of status.untracked) {
      if (!entryMap.has(untrackedPath)) {
        entryMap.set(untrackedPath, {
          path: untrackedPath,
          status: 'added',
          insertions: 0,
          deletions: 0,
        });
      }
    }
  }

  return Array.from(entryMap.values());
}

/**
 * Retrieves unified diff output for the worktree or a single file.
 */
export async function getDiff(
  executor: GitExecutor,
  worktreePath: string,
  options: GetDiffOptions = {},
): Promise<string> {
  const args = ['diff'];

  if (options.staged) {
    args.push('--cached');
  }

  if (options.baseRef) {
    args.push(`${options.baseRef}...HEAD`);
  }

  if (options.filePath) {
    args.push('--', options.filePath);
  }

  const result = await executor.exec(args, {
    cwd: worktreePath,
    allowNonZeroExit: true,
  });

  return result.stdout;
}
