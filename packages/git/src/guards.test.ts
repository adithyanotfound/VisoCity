import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { assertNotMainWorkingTree, assertWithinWorktreeRoot } from './guards.js';
import { MainWorkingTreeProtectionError, GitError } from './errors.js';

describe('Git Guard Tests', () => {
  const repoPath = '/tmp/fake-repo';
  const worktreeRootDir = path.join(repoPath, '.visocity', 'worktrees');

  it('allows isolated worktree paths distinct from main repository', () => {
    const validWorktree = path.join(worktreeRootDir, 'session-123');
    expect(() => {
      assertNotMainWorkingTree(repoPath, validWorktree, 'testOp');
    }).not.toThrow();
  });

  it('throws MainWorkingTreeProtectionError when target path equals repoPath', () => {
    expect(() => {
      assertNotMainWorkingTree(repoPath, repoPath, 'destructiveOp');
    }).toThrow(MainWorkingTreeProtectionError);
  });

  it('throws MainWorkingTreeProtectionError when relative path resolves to root', () => {
    expect(() => {
      assertNotMainWorkingTree(repoPath, path.join(repoPath, '.'), 'commitOp');
    }).toThrow(MainWorkingTreeProtectionError);
  });

  it('validates paths inside worktree root directory', () => {
    const validWorktree = path.join(worktreeRootDir, 'session-abc');
    expect(() => {
      assertWithinWorktreeRoot(validWorktree, worktreeRootDir, 'remove');
    }).not.toThrow();
  });

  it('throws GitError when worktree path escapes worktree root directory', () => {
    const maliciousPath = path.join(worktreeRootDir, '..', '..', 'src');
    expect(() => {
      assertWithinWorktreeRoot(maliciousPath, worktreeRootDir, 'remove');
    }).toThrow(GitError);
  });
});
