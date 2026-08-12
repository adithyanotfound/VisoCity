import { describe, it, expect } from 'vitest';
import { commitWorktreeChanges } from './commit.js';
import { pushWorktreeBranch } from './push.js';
import { MockGitExecutor } from './executor.js';
import { MainWorkingTreeProtectionError, GitError } from './errors.js';

describe('Commit and Push Tests', () => {
  const repoPath = '/repo';
  const worktreePath = '/repo/.visocity/worktrees/session-1';

  describe('commitWorktreeChanges', () => {
    it('throws MainWorkingTreeProtectionError if attempted on main repo path', async () => {
      const mock = new MockGitExecutor();
      await expect(
        commitWorktreeChanges(mock, repoPath, repoPath, { message: 'invalid' }),
      ).rejects.toThrow(MainWorkingTreeProtectionError);
    });

    it('stages files and creates commit with author metadata', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'status',
        () => ({ stdout: 'M  src/index.ts\n', stderr: '', exitCode: 0 }),
      );
      mock.on(
        (args) => args[0] === 'rev-parse' && args[1] === 'HEAD',
        () => ({ stdout: '1234567890abcdef1234567890abcdef12345678\n', stderr: '', exitCode: 0 }),
      );
      mock.on(
        (args) => args[0] === 'rev-parse' && args[1] === '--abbrev-ref',
        () => ({ stdout: 'agent/session-1\n', stderr: '', exitCode: 0 }),
      );

      const result = await commitWorktreeChanges(mock, repoPath, worktreePath, {
        message: 'Implement feature X',
        author: { name: 'Alice Agent', email: 'alice@example.com' },
      });

      expect(result.committed).toBe(true);
      expect(result.sha).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(result.branch).toBe('agent/session-1');

      const addCall = mock.callHistory.find((c) => c.args[0] === 'add');
      expect(addCall).toBeDefined();

      const commitCall = mock.callHistory.find((c) => c.args.includes('commit'));
      expect(commitCall?.args).toContain('Implement feature X');
      expect(commitCall?.args).toContain('Alice Agent <alice@example.com>');
    });

    it('handles clean working tree idempotently without throwing error', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'status',
        () => ({ stdout: '', stderr: '', exitCode: 0 }),
      );
      mock.on(
        (args) => args[0] === 'rev-parse' && args[1] === 'HEAD',
        () => ({ stdout: 'existing-sha\n', stderr: '', exitCode: 0 }),
      );

      const result = await commitWorktreeChanges(mock, repoPath, worktreePath, {
        message: 'No changes',
      });

      expect(result.committed).toBe(false);
      expect(result.sha).toBe('existing-sha');
    });
  });

  describe('pushWorktreeBranch', () => {
    it('throws MainWorkingTreeProtectionError if attempted on main repo', async () => {
      const mock = new MockGitExecutor();
      await expect(
        pushWorktreeBranch(mock, repoPath, repoPath, { branch: 'agent/main-bad' }),
      ).rejects.toThrow(MainWorkingTreeProtectionError);
    });

    it('pushes branch with upstream tracking and force-with-lease options', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'push',
        () => ({ stdout: 'Everything up-to-date\n', stderr: '', exitCode: 0 }),
      );

      const result = await pushWorktreeBranch(mock, repoPath, worktreePath, {
        branch: 'agent/session-1',
        remote: 'origin',
        force: true,
        setUpstream: true,
      });

      expect(result.success).toBe(true);
      expect(result.remote).toBe('origin');
      expect(result.branch).toBe('agent/session-1');

      const pushCall = mock.callHistory.find((c) => c.args[0] === 'push');
      expect(pushCall?.args).toContain('-u');
      expect(pushCall?.args).toContain('--force-with-lease');
      expect(pushCall?.args).toContain('agent/session-1:agent/session-1');
    });

    it('throws error when pushing detached HEAD without specified branch', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args.includes('--abbrev-ref'),
        () => ({ stdout: 'HEAD\n', stderr: '', exitCode: 0 }),
      );

      await expect(pushWorktreeBranch(mock, repoPath, worktreePath)).rejects.toThrow(GitError);
    });
  });
});
