/**
 * Git and Worktree Error Classes
 */

export class GitError extends Error {
  readonly command?: string;
  readonly args?: string[];
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;

  constructor(
    message: string,
    options?: {
      command?: string;
      args?: string[];
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'GitError';
    this.command = options?.command;
    this.args = options?.args;
    this.exitCode = options?.exitCode;
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class MainWorkingTreeProtectionError extends GitError {
  readonly repoPath: string;
  readonly targetPath: string;
  readonly operation: string;

  constructor(repoPath: string, targetPath: string, operation: string) {
    super(
      `CRITICAL GUARD: Attempted to perform agent mutating operation '${operation}' on main working tree at '${targetPath}'. Agents must operate exclusively within isolated worktrees!`,
      { command: operation },
    );
    this.name = 'MainWorkingTreeProtectionError';
    this.repoPath = repoPath;
    this.targetPath = targetPath;
    this.operation = operation;
  }
}

export class WorktreeNotFoundError extends GitError {
  readonly worktreePath: string;

  constructor(worktreePath: string, message?: string) {
    super(message ?? `Worktree not found at path: ${worktreePath}`);
    this.name = 'WorktreeNotFoundError';
    this.worktreePath = worktreePath;
  }
}

export class WorktreeAlreadyExistsError extends GitError {
  readonly worktreePath: string;

  constructor(worktreePath: string, message?: string) {
    super(message ?? `Worktree already exists at path: ${worktreePath}`);
    this.name = 'WorktreeAlreadyExistsError';
    this.worktreePath = worktreePath;
  }
}

export class WorktreeLockedError extends GitError {
  readonly worktreePath: string;
  readonly reason?: string;

  constructor(worktreePath: string, reason?: string) {
    super(`Worktree at '${worktreePath}' is locked${reason ? `: ${reason}` : ''}`);
    this.name = 'WorktreeLockedError';
    this.worktreePath = worktreePath;
    this.reason = reason;
  }
}

export class InvalidBranchNameError extends GitError {
  readonly branchName: string;

  constructor(branchName: string, reason?: string) {
    super(`Invalid git branch name '${branchName}'${reason ? `: ${reason}` : ''}`);
    this.name = 'InvalidBranchNameError';
    this.branchName = branchName;
  }
}

export class BranchNotFoundError extends GitError {
  readonly branchName: string;

  constructor(branchName: string) {
    super(`Branch '${branchName}' not found in repository`);
    this.name = 'BranchNotFoundError';
    this.branchName = branchName;
  }
}

export class SessionNotFoundError extends GitError {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Agent session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
  }
}
