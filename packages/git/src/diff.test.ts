import { describe, it, expect } from 'vitest';
import {
  parseGitStatusPorcelain,
  parseGitNumstat,
  parseGitNameStatus,
  mapGitStatusToFileDiffStatus,
  getWorktreeStatus,
  getChangedFiles,
  getDiff,
} from './diff.js';
import { MockGitExecutor } from './executor.js';

describe('Diff and Change Detection Tests', () => {
  describe('parseGitStatusPorcelain', () => {
    it('parses staged, unstaged, untracked, and renamed files', () => {
      const output = [
        'M  staged-file.ts',
        ' M unstaged-file.ts',
        'MM both-staged-and-unstaged.ts',
        'A  new-file.ts',
        'D  deleted-file.ts',
        'R  old-name.ts -> new-name.ts',
        '?? untracked-file.ts',
        '?? "path with spaces/file.txt"',
      ].join('\n');

      const result = parseGitStatusPorcelain(output);

      expect(result.staged).toHaveLength(5);
      expect(result.staged.map((s) => s.path)).toContain('staged-file.ts');
      expect(result.staged.map((s) => s.path)).toContain('new-name.ts');
      const renamed = result.staged.find((s) => s.path === 'new-name.ts');
      expect(renamed?.oldPath).toBe('old-name.ts');

      expect(result.unstaged).toHaveLength(2);
      expect(result.unstaged.map((u) => u.path)).toContain('unstaged-file.ts');

      expect(result.untracked).toHaveLength(2);
      expect(result.untracked).toContain('untracked-file.ts');
      expect(result.untracked).toContain('path with spaces/file.txt');
    });
  });

  describe('mapGitStatusToFileDiffStatus', () => {
    it('maps status codes to protocol FileDiffStatus', () => {
      expect(mapGitStatusToFileDiffStatus('A')).toBe('added');
      expect(mapGitStatusToFileDiffStatus('D')).toBe('deleted');
      expect(mapGitStatusToFileDiffStatus('R')).toBe('renamed');
      expect(mapGitStatusToFileDiffStatus('M')).toBe('modified');
      expect(mapGitStatusToFileDiffStatus('T')).toBe('modified');
    });
  });

  describe('parseGitNumstat', () => {
    it('parses numstat output including renames and binary files', () => {
      const output = [
        '10\t5\tsrc/index.ts',
        '-\t-\tassets/logo.png',
        '25\t0\tsrc/{old => new}.ts',
      ].join('\n');

      const result = parseGitNumstat(output);

      expect(result.get('src/index.ts')).toEqual({
        insertions: 10,
        deletions: 5,
        oldPath: undefined,
      });

      expect(result.get('assets/logo.png')).toEqual({
        insertions: 0,
        deletions: 0,
        oldPath: undefined,
      });

      expect(result.get('src/new.ts')).toEqual({
        insertions: 25,
        deletions: 0,
        oldPath: 'src/old.ts',
      });
    });
  });

  describe('parseGitNameStatus', () => {
    it('parses name status records', () => {
      const output = [
        'A\tsrc/new.ts',
        'M\tsrc/edit.ts',
        'D\tsrc/remove.ts',
        'R100\tsrc/old.ts\tsrc/renamed.ts',
      ].join('\n');

      const entries = parseGitNameStatus(output);
      expect(entries).toEqual([
        { path: 'src/new.ts', status: 'added' },
        { path: 'src/edit.ts', status: 'modified' },
        { path: 'src/remove.ts', status: 'deleted' },
        { path: 'src/renamed.ts', status: 'renamed', oldPath: 'src/old.ts' },
      ]);
    });
  });

  describe('getWorktreeStatus', () => {
    it('correctly aggregates status cleanliness metrics', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'status',
        () => ({
          stdout: 'M  file1.ts\n?? file2.ts\n',
          stderr: '',
          exitCode: 0,
        }),
      );

      const status = await getWorktreeStatus(mock, '/repo/worktree');
      expect(status.isClean).toBe(false);
      expect(status.staged).toHaveLength(1);
      expect(status.untracked).toHaveLength(1);
      expect(status.totalChanged).toBe(2);
    });
  });

  describe('getChangedFiles & getDiff', () => {
    it('computes changed files against base ref and local status', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'diff' && args[1] === '--name-status',
        () => ({
          stdout: 'M\tsrc/core.ts\nA\tsrc/new.ts\n',
          stderr: '',
          exitCode: 0,
        }),
      );
      mock.on(
        (args) => args[0] === 'diff' && args[1] === '--numstat',
        () => ({
          stdout: '12\t3\tsrc/core.ts\n40\t0\tsrc/new.ts\n',
          stderr: '',
          exitCode: 0,
        }),
      );
      mock.on(
        (args) => args[0] === 'status',
        () => ({
          stdout: '?? untracked.ts\n',
          stderr: '',
          exitCode: 0,
        }),
      );

      const changed = await getChangedFiles(mock, '/repo/worktree', { baseRef: 'main' });
      expect(changed).toHaveLength(3);
      expect(changed.find((c) => c.path === 'src/core.ts')).toEqual({
        path: 'src/core.ts',
        status: 'modified',
        insertions: 12,
        deletions: 3,
        oldPath: undefined,
      });
      expect(changed.find((c) => c.path === 'untracked.ts')?.status).toBe('added');
    });

    it('retrieves unified diff output', async () => {
      const mock = new MockGitExecutor();
      mock.on(
        (args) => args[0] === 'diff',
        () => ({
          stdout: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n',
          stderr: '',
          exitCode: 0,
        }),
      );

      const diff = await getDiff(mock, '/repo/worktree', { filePath: 'src/app.ts' });
      expect(diff).toContain('+new');
    });
  });
});
