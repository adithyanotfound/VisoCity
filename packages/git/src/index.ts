export * from './errors.js';
export * from './guards.js';
export * from './executor.js';
export * from './branch.js';
export * from './worktree.js';
export * from './diff.js';
export * from './commit.js';
export * from './push.js';
export * from './service.js';

export interface GitClientOptions {
  repoPath: string;
}

export function isGitClientReady(): boolean {
  return true;
}
