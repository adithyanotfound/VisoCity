import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  parseWorktreeListPorcelain,
  addWorktree,
  removeWorktree,
  lockWorktree,
  unlockWorktree,
} from './worktree.js';
import { MockGitExecutor } from './executor.js';
import { MainWorkingTreeProtectionError } from './errors.js';

describe('Worktree Unit Tests', () => {
  const repoPath = '/repo';
  const worktreeRootDir = path.join(repoPath, '.visocity', 'worktrees');
  const sessionWorktree = path.join(worktreeRootDir, 'session-123');

  describe('parseWorktreeListPorcelain', () => {
    it('parses multi-entry porcelain output with detached, bare, locked, and prunable entries', () => {
      const output = [
        'worktree /repo',
        'HEAD 1111111111111111111111111111111111111111',
        'branch refs/heads/main',
        '',
        'worktree /repo/.visocity/worktrees/wt1',
        'HEAD 2222222222222222222222222222222222222222',
        'branch refs/heads/agent/wt1',
        'locked busy working',
        '',
        'worktree /repo/.visocity/worktrees/wt2',
        'HEAD 3333333333333333333333333333333333333333',
        'detached',
        '',
        'worktree /repo/.visocity/worktrees/wt3',
        'HEAD 4444444444444444444444444444444444444444',
        'prunable gitdir file points to non-existent location',
      ].join('\n');

      const worktrees = parseWorktreeListPorcelain(output);

      expect(worktrees).toHaveLength(4);
      expect(worktrees[0].branch).toBe('main');
      expect(worktrees[0].isLocked).toBe(false);

      expect(worktrees[1].branch).toBe('agent/wt1');
      expect(worktrees[1].isLocked).toBe(true);
      expect(worktrees[1].lockReason).toBe('busy working');

      expect(worktrees[2].isDetached).toBe(true);

      expect(worktrees[3].isPrunable).toBe(true);
      expect(worktrees[3].prunableReason).toContain('points to non-existent location');
    });
  });

  describe('Worktree operations with MockGitExecutor', () => {
    it('throws MainWorkingTreeProtectionError when trying to add worktree at repo root', async () => {
      const mock = new MockGitExecutor();
      await expect(
        addWorktree(mock, {
          repoPath,
          worktreePath: repoPath,
        }),
      ).rejects.toThrow(MainWorkingTreeProtectionError);
    });

    it('throws MainWorkingTreeProtectionError when trying to remove main repo', async () => {
      const mock = new MockGitExecutor();
      await expect(removeWorktree(mock, repoPath, repoPath)).rejects.toThrow(
        MainWorkingTreeProtectionError,
      );
    });

    it('adds worktree with new branch and checks existence', async () => {
      const mock = new MockGitExecutor();
      let created = false;

      mock.on(
        (args) => args[0] === 'worktree' && args[1] === 'list',
        () => {
          if (!created) {
            return {
              stdout: `worktree ${repoPath}\nHEAD 1111\nbranch refs/heads/main\n`,
              stderr: '',
              exitCode: 0,
            };
          }
          return {
            stdout: `worktree ${repoPath}\nHEAD 1111\nbranch refs/heads/main\n\nworktree ${sessionWorktree}\nHEAD 2222\nbranch refs/heads/agent/test\n`,
            stderr: '',
            exitCode: 0,
          };
        },
      );

      mock.on(
        (args) => args[0] === 'rev-parse' && args.includes('refs/heads/agent/test'),
        () => ({ stdout: '', stderr: '', exitCode: 1 }), // Branch does not exist initially
      );

      mock.on(
        (args) => args[0] === 'worktree' && args[1] === 'add',
        () => {
          created = true;
          return { stdout: 'Preparing worktree\n', stderr: '', exitCode: 0 };
        },
      );

      const info = await addWorktree(mock, {
        repoPath,
        worktreePath: sessionWorktree,
        branch: 'agent/test',
        createBranch: true,
      });

      expect(info).toBeDefined();
      expect(info.branch).toBe('agent/test');
    });

    it('locks and unlocks worktree', async () => {
      const mock = new MockGitExecutor();
      await lockWorktree(mock, repoPath, sessionWorktree, 'agent processing');
      const lockCall = mock.callHistory.find((c) => c.args.includes('lock'));
      expect(lockCall?.args).toContain('--reason');
      expect(lockCall?.args).toContain('agent processing');

      await unlockWorktree(mock, repoPath, sessionWorktree);
      const unlockCall = mock.callHistory.find((c) => c.args.includes('unlock'));
      expect(unlockCall).toBeDefined();
    });

    it('removes worktree safely with force and prunes', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'rev-parse' && args.includes('refs/heads/agent/cleanup'),
        () => ({ stdout: 'sha\n', stderr: '', exitCode: 0 }),
      );

      await removeWorktree(mock, repoPath, sessionWorktree, {
        force: true,
        deleteBranch: true,
        branchName: 'agent/cleanup',
      });

      const removeCall = mock.callHistory.find(
        (c) => c.args[0] === 'worktree' && c.args[1] === 'remove',
      );
      expect(removeCall?.args).toContain('--force');

      const pruneCall = mock.callHistory.find(
        (c) => c.args[0] === 'worktree' && c.args[1] === 'prune',
      );
      expect(pruneCall).toBeDefined();

      const branchDeleteCall = mock.callHistory.find(
        (c) => c.args[0] === 'branch' && c.args[1] === '-D',
      );
      expect(branchDeleteCall?.args).toContain('agent/cleanup');
    });
  });
});
