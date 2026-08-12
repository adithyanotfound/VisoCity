import { describe, it, expect } from 'vitest';
import {
  sanitizeBranchName,
  isValidBranchName,
  formatAgentBranchName,
  branchExists,
  createBranch,
  deleteBranch,
  getCurrentBranch,
  getCommitSha,
} from './branch.js';
import { MockGitExecutor } from './executor.js';

describe('Branch Management Tests', () => {
  describe('sanitizeBranchName', () => {
    it('replaces spaces, control characters, and invalid git characters', () => {
      expect(sanitizeBranchName('feature / test ^ name ~ 1')).toBe('feature/test-name-1');
      expect(sanitizeBranchName('fix:colon?question*star[bracket]')).toBe(
        'fix-colon-question-star-bracket',
      );
      expect(sanitizeBranchName('branch@{upstream}')).toBe('branch-upstream');
      expect(sanitizeBranchName('feature..bug')).toBe('feature-bug');
    });

    it('cleans leading and trailing dots, slashes, and hyphens', () => {
      expect(sanitizeBranchName('/feature/test/')).toBe('feature/test');
      expect(sanitizeBranchName('..feature..')).toBe('feature');
      expect(sanitizeBranchName('---branch---')).toBe('branch');
    });

    it('removes .lock suffixes', () => {
      expect(sanitizeBranchName('my-branch.lock')).toBe('my-branch');
      expect(sanitizeBranchName('agent/fix.lock/sub')).toBe('agent/fix/sub');
    });

    it('returns fallback for empty or completely invalid input', () => {
      expect(sanitizeBranchName('')).toBe('agent-workspace');
      expect(sanitizeBranchName('...///---')).toBe('agent-workspace');
    });
  });

  describe('formatAgentBranchName', () => {
    it('creates deterministic branch name from sessionId', () => {
      const branch = formatAgentBranchName({ sessionId: 'session-uuid-1234-5678' });
      expect(branch).toBe('agent/session-uuid-1234-5678');
    });

    it('includes agentId and taskName when provided', () => {
      const branch = formatAgentBranchName({
        sessionId: 'session-uuid-1234-5678',
        agentId: 'architect',
        taskName: 'auth-refactor',
      });
      expect(branch).toBe('agent/architect-auth-refactor-session');
    });

    it('supports custom prefixes', () => {
      const branch = formatAgentBranchName({
        sessionId: 'session-42',
        prefix: 'issue-fix',
      });
      expect(branch).toBe('issue-fix/session-42');
    });
  });

  describe('isValidBranchName', () => {
    it('validates safe branch names correctly', () => {
      expect(isValidBranchName('agent/session-123')).toBe(true);
      expect(isValidBranchName('main')).toBe(true);
      expect(isValidBranchName('feature/my-task_1')).toBe(true);
    });

    it('rejects invalid branch names', () => {
      expect(isValidBranchName('')).toBe(false);
      expect(isValidBranchName('/leading-slash')).toBe(false);
      expect(isValidBranchName('trailing-slash/')).toBe(false);
      expect(isValidBranchName('has space')).toBe(false);
      expect(isValidBranchName('branch..double')).toBe(false);
      expect(isValidBranchName('branch.lock')).toBe(false);
      expect(isValidBranchName('@')).toBe(false);
    });
  });

  describe('Git Executor Branch Operations', () => {
    it('checks branch existence via rev-parse', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args.includes('refs/heads/feature-exist'),
        () => ({ stdout: 'abcd1234efgh\n', stderr: '', exitCode: 0 }),
      );
      mock.on(
        (args) => args.includes('refs/heads/non-existent'),
        () => ({ stdout: '', stderr: 'not found', exitCode: 1 }),
      );

      expect(await branchExists(mock, '/repo', 'feature-exist')).toBe(true);
      expect(await branchExists(mock, '/repo', 'non-existent')).toBe(false);
    });

    it('creates branch idempotently without failing if it already exists', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args.includes('refs/heads/agent/new-branch'),
        () => ({ stdout: '', stderr: '', exitCode: 1 }), // does not exist initially
      );

      await createBranch(mock, '/repo', 'agent/new-branch', 'HEAD');

      const createCall = mock.callHistory.find(
        (c) => c.args[0] === 'branch' && c.args[1] === 'agent/new-branch',
      );
      expect(createCall).toBeDefined();
    });

    it('deletes branch safely and idempotently', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args.includes('refs/heads/agent/to-delete'),
        () => ({ stdout: 'sha', stderr: '', exitCode: 0 }),
      );

      await deleteBranch(mock, '/repo', 'agent/to-delete', true);

      const deleteCall = mock.callHistory.find(
        (c) => c.args[0] === 'branch' && c.args[1] === '-D' && c.args[2] === 'agent/to-delete',
      );
      expect(deleteCall).toBeDefined();
    });

    it('gets commit sha and current branch name', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args.includes('--abbrev-ref'),
        () => ({ stdout: 'agent/session-1\n', stderr: '', exitCode: 0 }),
      );
      mock.on(
        (args) => args[0] === 'rev-parse' && args[1] === 'HEAD',
        () => ({ stdout: 'e9c7a2b34567890abcdef1234567890abcdef12\n', stderr: '', exitCode: 0 }),
      );

      const currentBranch = await getCurrentBranch(mock, '/repo/worktree');
      expect(currentBranch).toBe('agent/session-1');

      const sha = await getCommitSha(mock, '/repo/worktree', 'HEAD');
      expect(sha).toBe('e9c7a2b34567890abcdef1234567890abcdef12');
    });
  });
});
