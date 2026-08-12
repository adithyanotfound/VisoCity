import { GitExecutor } from './executor.js';
import { getCurrentBranch } from './branch.js';
import { assertNotMainWorkingTree } from './guards.js';
import { GitError } from './errors.js';

export interface PushWorktreeOptions {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  force?: boolean;
  dryRun?: boolean;
  tags?: boolean;
}

export interface PushResult {
  success: boolean;
  remote: string;
  branch: string;
  targetRef: string;
  stdout: string;
  stderr: string;
  dryRun: boolean;
}

/**
 * Pushes the active branch from an isolated agent worktree to a remote repository.
 */
export async function pushWorktreeBranch(
  executor: GitExecutor,
  repoPath: string,
  worktreePath: string,
  options: PushWorktreeOptions = {},
): Promise<PushResult> {
  // STRICT GUARD: Guard main working tree
  assertNotMainWorkingTree(repoPath, worktreePath, 'pushWorktreeBranch');

  const remote = options.remote ?? 'origin';
  let branchName = options.branch;

  if (!branchName) {
    branchName = await getCurrentBranch(executor, worktreePath);
    if (!branchName || branchName === 'HEAD') {
      throw new GitError(
        'Cannot push from a detached HEAD worktree without specifying a target branch name',
      );
    }
  }

  const targetRef = `refs/heads/${branchName}`;
  const pushArgs: string[] = ['push'];

  if (options.setUpstream ?? true) {
    pushArgs.push('-u');
  }

  if (options.force) {
    pushArgs.push('--force-with-lease');
  }

  if (options.dryRun) {
    pushArgs.push('--dry-run');
  }

  if (options.tags) {
    pushArgs.push('--tags');
  }

  pushArgs.push(remote, `${branchName}:${branchName}`);

  const result = await executor.exec(pushArgs, { cwd: worktreePath });

  return {
    success: result.exitCode === 0,
    remote,
    branch: branchName,
    targetRef,
    stdout: result.stdout,
    stderr: result.stderr,
    dryRun: options.dryRun ?? false,
  };
}
