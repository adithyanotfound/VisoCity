import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { AgentWorktreeService } from './service.js';
import { MockGitExecutor } from './executor.js';
import { SessionNotFoundError } from './errors.js';

describe('AgentWorktreeService Unit Tests', () => {
  let mockExecutor: MockGitExecutor;
  let service: AgentWorktreeService;
  const repoPath = '/workspace/repo';
  const worktreesRoot = path.join(repoPath, '.visocity', 'worktrees');

  beforeEach(() => {
    mockExecutor = new MockGitExecutor();
    service = new AgentWorktreeService(mockExecutor);

    // Default git check responses
    mockExecutor.on(
      (args) => args.includes('--git-dir'),
      () => ({ stdout: '.git\n', stderr: '', exitCode: 0 }),
    );
    mockExecutor.on(
      (args) => args[0] === 'rev-parse' && args[1] === 'HEAD',
      () => ({ stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', stderr: '', exitCode: 0 }),
    );
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'list',
      () => ({
        stdout: `worktree ${repoPath}\nHEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nbranch refs/heads/main\n`,
        stderr: '',
        exitCode: 0,
      }),
    );
  });

  it('creates an isolated agent workspace and registers it', async () => {
    let created = false;
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'add',
      () => {
        created = true;
        return { stdout: 'Worktree created\n', stderr: '', exitCode: 0 };
      },
    );
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'list',
      () => {
        if (created) {
          return {
            stdout: `worktree ${repoPath}\nHEAD aaaa\nbranch refs/heads/main\n\nworktree ${worktreesRoot}/session-123\nHEAD aaaa\nbranch refs/heads/agent/session-123\n`,
            stderr: '',
            exitCode: 0,
          };
        }
        return {
          stdout: `worktree ${repoPath}\nHEAD aaaa\nbranch refs/heads/main\n`,
          stderr: '',
          exitCode: 0,
        };
      },
    );

    const ws = await service.createWorkspace({
      repoPath,
      sessionId: 'session-123',
      agentId: 'worker',
      taskName: 'fix-bug',
    });

    expect(ws.sessionId).toBe('session-123');
    expect(ws.branchName).toBe('agent/worker-fix-bug-session');
    expect(ws.status).toBe('active');
    expect(ws.worktreePath).toContain('session-123');

    const lookup = service.getWorkspace('session-123');
    expect(lookup).toBeDefined();
    expect(lookup?.sessionId).toBe('session-123');
  });

  it('detects changes in workspace and commits', async () => {
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'add',
      () => ({ stdout: '', stderr: '', exitCode: 0 }),
    );
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'list',
      () => ({
        stdout: `worktree ${repoPath}\nHEAD aaaa\nbranch refs/heads/main\n\nworktree ${worktreesRoot}/session-abc\nHEAD aaaa\nbranch refs/heads/agent/session-abc\n`,
        stderr: '',
        exitCode: 0,
      }),
    );

    await service.createWorkspace({
      repoPath,
      sessionId: 'session-abc',
    });

    mockExecutor.on(
      (args) => args[0] === 'status',
      () => ({ stdout: 'M  src/app.ts\n', stderr: '', exitCode: 0 }),
    );

    const status = await service.detectWorkspaceChanges('session-abc');
    expect(status.isClean).toBe(false);
    expect(status.staged).toHaveLength(1);

    mockExecutor.on(
      (args) => args[0] === 'rev-parse' && args[1] === 'HEAD',
      () => ({ stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n', stderr: '', exitCode: 0 }),
    );
    mockExecutor.on(
      (args) => args[0] === 'rev-parse' && args[1] === '--abbrev-ref',
      () => ({ stdout: 'agent/session-abc\n', stderr: '', exitCode: 0 }),
    );

    const commitRes = await service.commitWorkspaceChanges('session-abc', 'Test commit');
    expect(commitRes.committed).toBe(true);
    expect(commitRes.sha).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('cleans up workspace and marks status cleaned', async () => {
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'list',
      () => ({
        stdout: `worktree ${repoPath}\nHEAD aaaa\nbranch refs/heads/main\n\nworktree ${worktreesRoot}/session-del\nHEAD aaaa\nbranch refs/heads/agent/session-del\n`,
        stderr: '',
        exitCode: 0,
      }),
    );

    await service.createWorkspace({
      repoPath,
      sessionId: 'session-del',
    });

    await service.cleanupWorkspace('session-del', { deleteBranch: true });
    const ws = service.getWorkspace('session-del');
    expect(ws?.status).toBe('cleaned');
  });

  it('marks failed session and records error', async () => {
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'list',
      () => ({
        stdout: `worktree ${repoPath}\nHEAD aaaa\nbranch refs/heads/main\n\nworktree ${worktreesRoot}/session-fail\nHEAD aaaa\nbranch refs/heads/agent/session-fail\n`,
        stderr: '',
        exitCode: 0,
      }),
    );

    await service.createWorkspace({
      repoPath,
      sessionId: 'session-fail',
    });

    await service.markSessionFailed('session-fail', new Error('Syntax error'));
    const ws = service.getWorkspace('session-fail');
    expect(ws?.status).toBe('failed');
    expect(ws?.error).toBe('Syntax error');
  });

  it('recovers and cleans abandoned sessions', async () => {
    mockExecutor.on(
      (args) => args[0] === 'worktree' && args[1] === 'list',
      () => ({
        stdout: `worktree ${repoPath}\nHEAD aaaa\nbranch refs/heads/main\n\nworktree ${worktreesRoot}/orphaned-session\nHEAD aaaa\nbranch refs/heads/agent/orphaned\n`,
        stderr: '',
        exitCode: 0,
      }),
    );

    const summary = await service.recoverAbandonedSessions(repoPath);
    expect(summary.cleanedCount).toBeGreaterThanOrEqual(1);
    expect(summary.cleanedWorktrees.some((p) => p.includes('orphaned-session'))).toBe(true);
  });

  it('throws SessionNotFoundError for unknown session IDs', async () => {
    await expect(service.detectWorkspaceChanges('unknown-session')).rejects.toThrow(
      SessionNotFoundError,
    );
  });
});
