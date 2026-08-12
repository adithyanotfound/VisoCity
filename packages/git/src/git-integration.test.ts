import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { DefaultGitExecutor } from './executor.js';
import { AgentWorktreeService } from './service.js';
import { addWorktree, listWorktrees } from './worktree.js';

describe('Git Worktree End-to-End Integration Tests', () => {
  let tempDir: string;
  let repoPath: string;
  let executor: DefaultGitExecutor;
  let service: AgentWorktreeService;

  beforeAll(async () => {
    // 1. Create unique temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'visoagent-git-test-'));
    repoPath = path.join(tempDir, 'main-repo');
    await fs.mkdir(repoPath, { recursive: true });

    executor = new DefaultGitExecutor();
    service = new AgentWorktreeService(executor);

    // 2. Initialize real git repository
    await executor.exec(['init', '-b', 'main'], { cwd: repoPath });
    await executor.exec(['config', 'user.name', 'Integration Tester'], { cwd: repoPath });
    await executor.exec(['config', 'user.email', 'tester@visocity.local'], { cwd: repoPath });

    // 3. Create initial commit
    await fs.writeFile(path.join(repoPath, 'README.md'), '# Main Repo\nInitial content');
    await executor.exec(['add', 'README.md'], { cwd: repoPath });
    await executor.exec(['commit', '-m', 'Initial commit on main'], { cwd: repoPath });
  });

  afterAll(async () => {
    // Cleanup temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
  });

  it('proves workspace isolation, change detection, commit, and safe cleanup', async () => {
    const sessionId = 'session-int-001';
    const mainInitialSha = (
      await executor.exec(['rev-parse', 'HEAD'], { cwd: repoPath })
    ).stdout.trim();

    // 1. Create agent workspace
    const workspace = await service.createWorkspace({
      repoPath,
      sessionId,
      agentId: 'worker',
      taskName: 'feature-isolated',
    });

    expect(workspace.sessionId).toBe(sessionId);
    expect(workspace.status).toBe('active');
    expect(workspace.baseSha).toBe(mainInitialSha);

    // Verify worktree exists on disk
    const stat = await fs.stat(workspace.worktreePath);
    expect(stat.isDirectory()).toBe(true);

    // 2. Write file inside the isolated worktree
    const agentFileRelPath = 'src/worker-code.ts';
    const agentFileAbsPath = path.join(workspace.worktreePath, agentFileRelPath);
    await fs.mkdir(path.dirname(agentFileAbsPath), { recursive: true });
    await fs.writeFile(agentFileAbsPath, 'export const agentWorked = true;\n');

    // STRICT ISOLATION ASSERTION:
    // File MUST NOT exist in main repository
    const mainFileAbsPath = path.join(repoPath, agentFileRelPath);
    await expect(fs.stat(mainFileAbsPath)).rejects.toThrow();

    // 3. Detect changes in worktree
    const status = await service.detectWorkspaceChanges(sessionId);
    expect(status.isClean).toBe(false);
    expect(status.untracked).toContain(agentFileRelPath);

    const changedFiles = await service.getWorkspaceChangedFiles(sessionId);
    expect(changedFiles.some((f) => f.path === agentFileRelPath)).toBe(true);

    // 4. Commit changes in the worktree
    const commitResult = await service.commitWorkspaceChanges(
      sessionId,
      'Add worker-code.ts feature',
    );
    expect(commitResult.committed).toBe(true);
    expect(commitResult.sha).toBeDefined();
    expect(commitResult.sha).not.toBe(mainInitialSha);

    // Verify that main repository HEAD was NOT modified
    const mainCurrentSha = (
      await executor.exec(['rev-parse', 'HEAD'], { cwd: repoPath })
    ).stdout.trim();
    expect(mainCurrentSha).toBe(mainInitialSha);

    // 5. Cleanup the workspace
    await service.cleanupWorkspace(sessionId, { deleteBranch: false });
    expect(service.getWorkspace(sessionId)?.status).toBe('cleaned');

    // Verify worktree folder is removed
    await expect(fs.stat(workspace.worktreePath)).rejects.toThrow();

    // Verify worktree is no longer in git worktree list
    const worktreeList = await listWorktrees(executor, repoPath);
    expect(worktreeList.some((wt) => wt.path === workspace.worktreePath)).toBe(false);
  }, 25000);

  it('safely recovers and cleans abandoned orphaned worktrees', async () => {
    const orphanedWorktreePath = path.join(repoPath, '.visocity', 'worktrees', 'orphaned-test');

    // Create an orphaned worktree directly
    const createdInfo = await addWorktree(executor, {
      repoPath,
      worktreePath: orphanedWorktreePath,
      detach: true,
    });

    const worktreesBefore = await listWorktrees(executor, repoPath);
    expect(worktreesBefore.some((wt) => wt.path === createdInfo.path)).toBe(true);

    // Recover abandoned sessions
    const summary = await service.recoverAbandonedSessions(repoPath);
    expect(summary.cleanedCount).toBeGreaterThanOrEqual(1);

    // Verify orphaned worktree is cleaned
    const worktreesAfter = await listWorktrees(executor, repoPath);
    expect(worktreesAfter.some((wt) => wt.path === createdInfo.path)).toBe(false);
  }, 25000);
});
