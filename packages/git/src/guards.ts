import path from 'node:path';
import fs from 'node:fs';
import { MainWorkingTreeProtectionError, GitError } from './errors.js';

/**
 * Normalizes and resolves a filesystem path to its canonical realpath,
 * resolving symlinks for existing paths or nearest existing parent directories.
 */
export function resolveCanonicalPath(targetPath: string): string {
  const absolutePath = path.resolve(targetPath);
  try {
    return fs.realpathSync.native
      ? fs.realpathSync.native(absolutePath)
      : fs.realpathSync(absolutePath);
  } catch {
    // If targetPath does not exist, resolve canonical path of nearest existing ancestor
    let current = path.dirname(absolutePath);
    const parts: string[] = [path.basename(absolutePath)];
    while (current && current !== path.dirname(current)) {
      try {
        const resolvedParent = fs.realpathSync.native
          ? fs.realpathSync.native(current)
          : fs.realpathSync(current);
        return path.resolve(resolvedParent, ...parts.reverse());
      } catch {
        parts.push(path.basename(current));
        current = path.dirname(current);
      }
    }
    return path.normalize(absolutePath);
  }
}

/**
 * Guard that strictly forbids running mutating or worktree operations on the repository's main working tree.
 */
export function assertNotMainWorkingTree(
  repoPath: string,
  targetPath: string,
  operation: string,
): void {
  const canonicalRepo = resolveCanonicalPath(repoPath);
  const canonicalTarget = resolveCanonicalPath(targetPath);

  if (canonicalRepo === canonicalTarget) {
    throw new MainWorkingTreeProtectionError(repoPath, targetPath, operation);
  }

  const relative = path.relative(canonicalRepo, canonicalTarget);
  if (relative === '' || relative === '.') {
    throw new MainWorkingTreeProtectionError(repoPath, targetPath, operation);
  }
}

/**
 * Verifies that a worktree path resides within an allowed worktrees root directory
 * to prevent directory traversal or accidental deletion of external folders.
 */
export function assertWithinWorktreeRoot(
  worktreePath: string,
  worktreeRootDir: string,
  operation: string,
): void {
  const canonicalRoot = resolveCanonicalPath(worktreeRootDir);
  const canonicalTarget = resolveCanonicalPath(worktreePath);

  const relative = path.relative(canonicalRoot, canonicalTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GitError(
      `Security Violation: Worktree operation '${operation}' target path '${worktreePath}' is outside the authorized worktree root directory '${worktreeRootDir}'`,
    );
  }
}
