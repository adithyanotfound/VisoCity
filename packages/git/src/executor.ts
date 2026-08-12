import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitError } from './errors.js';

const execFileAsync = promisify(execFile);

export interface GitExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBuffer?: number;
  allowNonZeroExit?: boolean;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitExecutor {
  exec(args: string[], options?: GitExecOptions): Promise<GitExecResult>;
}

export class DefaultGitExecutor implements GitExecutor {
  private readonly defaultEnv: NodeJS.ProcessEnv;
  private readonly defaultTimeoutMs: number;

  constructor(options?: { defaultEnv?: NodeJS.ProcessEnv; defaultTimeoutMs?: number }) {
    this.defaultEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      GIT_ASKPASS: 'echo',
      LC_ALL: 'C',
      ...options?.defaultEnv,
    };
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 30000;
  }

  async exec(args: string[], options: GitExecOptions = {}): Promise<GitExecResult> {
    const cwd = options.cwd ?? process.cwd();
    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024; // 10MB default buffer
    const env = {
      ...this.defaultEnv,
      ...options.env,
    };

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd,
        env,
        timeout,
        maxBuffer,
        encoding: 'utf-8',
      });

      return {
        stdout: typeof stdout === 'string' ? stdout : String(stdout),
        stderr: typeof stderr === 'string' ? stderr : String(stderr),
        exitCode: 0,
      };
    } catch (err: unknown) {
      const execError = err as {
        code?: number | string;
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        message?: string;
        killed?: boolean;
      };

      const stdout = execError.stdout
        ? typeof execError.stdout === 'string'
          ? execError.stdout
          : execError.stdout.toString()
        : '';
      const stderr = execError.stderr
        ? typeof execError.stderr === 'string'
          ? execError.stderr
          : execError.stderr.toString()
        : '';
      const exitCode = typeof execError.code === 'number' ? execError.code : 1;

      if (options.allowNonZeroExit) {
        return { stdout, stderr, exitCode };
      }

      const errorMessage =
        stderr.trim() || stdout.trim() || execError.message || 'Git command failed';
      throw new GitError(`git ${args.join(' ')} failed: ${errorMessage}`, {
        command: 'git',
        args,
        exitCode,
        stdout,
        stderr,
        cause: err,
      });
    }
  }
}

export type MockGitHandler = (
  args: string[],
  options?: GitExecOptions,
) => Promise<GitExecResult> | GitExecResult;

export class MockGitExecutor implements GitExecutor {
  private handlers: Array<{
    matcher: (args: string[], options?: GitExecOptions) => boolean;
    handler: MockGitHandler;
  }> = [];
  public callHistory: Array<{ args: string[]; options?: GitExecOptions }> = [];

  on(matcher: (args: string[]) => boolean, handler: MockGitHandler): this {
    this.handlers.push({ matcher, handler });
    return this;
  }

  onPattern(pattern: RegExp | string, handler: MockGitHandler): this {
    const isString = typeof pattern === 'string';
    return this.on((args) => {
      const cmd = args.join(' ');
      return isString ? cmd.includes(pattern) : pattern.test(cmd);
    }, handler);
  }

  clearHandlers(): void {
    this.handlers = [];
    this.callHistory = [];
  }

  async exec(args: string[], options: GitExecOptions = {}): Promise<GitExecResult> {
    this.callHistory.push({ args: [...args], options: { ...options } });

    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const { matcher, handler } = this.handlers[i];
      if (matcher(args, options)) {
        return await handler(args, options);
      }
    }

    // Default fallback mock response
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }
}
