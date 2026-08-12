import { GitExecutor } from './executor.js';
import { getWorktreeStatus } from './diff.js';
import { getCurrentBranch, getCommitSha } from './branch.js';
import { assertNotMainWorkingTree } from './guards.js';
import { GitError } from './errors.js';

export interface CommitWorktreeOptions {
  message: string;
  files?: string[];
  author?: {
    name: string;
    email: string;
  };
  allowEmpty?: boolean;
  stageAll?: boolean;
}

export interface CommitResult {
  committed: boolean;
  sha: string;
  message: string;
  filesChanged: number;
  branch?: string;
  timestamp: number;
}

/**
 * Stages and commits changes in an isolated agent worktree.
 */
export async function commitWorktreeChanges(
  executor: GitExecutor,
  repoPath: string,
  worktreePath: string,
  options: CommitWorktreeOptions,
): Promise<CommitResult> {
  // STRICT GUARD: Guard main working tree
  assertNotMainWorkingTree(repoPath, worktreePath, 'commitWorktreeChanges');

  if (!options.message || typeof options.message !== 'string') {
    throw new GitError('Commit message is required');
  }

  // 1. Stage files
  if (options.files && options.files.length > 0) {
    await executor.exec(['add', '--', ...options.files], { cwd: worktreePath });
  } else if (options.stageAll ?? true) {
    await executor.exec(['add', '-A'], { cwd: worktreePath });
  }

  // 2. Check if there are changes to commit
  const status = await getWorktreeStatus(executor, worktreePath);
  const currentSha = await getCommitSha(executor, worktreePath).catch(() => '');

  if (status.staged.length === 0 && !options.allowEmpty) {
    let branch: string | undefined;
    try {
      branch = await getCurrentBranch(executor, worktreePath);
    } catch {
      // Detached or initial
    }

    return {
      committed: false,
      sha: currentSha,
      message: options.message,
      filesChanged: 0,
      branch,
      timestamp: Date.now(),
    };
  }

  // 3. Build git commit command
  const commitArgs: string[] = ['commit', '-m', options.message];

  if (options.allowEmpty) {
    commitArgs.push('--allow-empty');
  }

  if (options.author) {
    commitArgs.push('--author', `${options.author.name} <${options.author.email}>`);
  } else {
    // Provide default author flags if none configured in environment
    commitArgs.unshift('-c', 'user.name=VisoAgent', '-c', 'user.email=agent@visocity.local');
  }

  await executor.exec(commitArgs, { cwd: worktreePath });

  // 4. Retrieve new commit SHA and branch
  const newSha = await getCommitSha(executor, worktreePath);
  let branch: string | undefined;
  try {
    branch = await getCurrentBranch(executor, worktreePath);
    if (branch === 'HEAD') {
      branch = undefined;
    }
  } catch {
    // Detached
  }

  return {
    committed: true,
    sha: newSha,
    message: options.message,
    filesChanged: status.staged.length,
    branch,
    timestamp: Date.now(),
  };
}
