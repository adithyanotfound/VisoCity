import {
  ProcessAgentRunner,
  ProcessExecutionHandle,
  type ProcessSpawnConfig,
} from './process-runner.js';
import type { AgentRunnerOptions } from '../types.js';

export interface AntigravityCliConfig {
  executablePath?: string;
  outputFormat?: 'stream-json' | 'json' | 'text';
  defaultModel?: string;
}

export class AntigravityCliRunner extends ProcessAgentRunner {
  public readonly name = 'antigravity-cli';
  private executablePath: string;
  private outputFormat: 'stream-json' | 'json' | 'text';

  constructor(config: AntigravityCliConfig = {}) {
    super();
    this.executablePath = config.executablePath ?? process.env.ANTIGRAVITY_BIN ?? 'agy';
    this.outputFormat = config.outputFormat ?? 'stream-json';
  }

  public buildSpawnConfig(options: AgentRunnerOptions): ProcessSpawnConfig {
    const args: string[] = ['-p', options.prompt, '--output-format', this.outputFormat];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.effort) {
      // Map 'max' or other effort levels to Antigravity CLI supported (low | medium | high)
      const effort = options.effort === 'max' ? 'high' : options.effort;
      args.push('--effort', effort);
    }

    if (options.permissionMode === 'auto') {
      args.push('--dangerously-skip-permissions');
    }

    if (options.sessionId) {
      args.push('--conversation', options.sessionId);
    }

    if (options.contextPaths && options.contextPaths.length > 0) {
      for (const ctxPath of options.contextPaths) {
        args.push('--add-dir', ctxPath);
      }
    }

    return {
      command: this.executablePath,
      args,
      cwd: options.workingDirectory,
      env: options.env,
      timeoutMs: options.timeoutMs,
    };
  }

  protected handleLine(line: string, handle: ProcessExecutionHandle): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed);

      // Handle standard protocol / Antigravity CLI structured events
      if (parsed.type === 'assistant.message' || parsed.type === 'text_chunk') {
        handle.emitEvent({
          type: 'text_chunk',
          payload: parsed.textChunk ?? parsed.text ?? parsed.content ?? '',
          timestamp: Date.now(),
        });
        return;
      }

      if (parsed.type === 'tool.started' || parsed.type === 'tool_start') {
        handle.emitEvent({
          type: 'tool_start',
          payload: {
            toolName: parsed.toolName ?? parsed.name ?? 'unknown',
            input: parsed.input ?? parsed.args ?? {},
            targetPath: parsed.targetPath ?? parsed.path,
          },
          timestamp: Date.now(),
        });
        return;
      }

      if (parsed.type === 'tool.completed' || parsed.type === 'tool_end') {
        handle.emitEvent({
          type: 'tool_end',
          payload: {
            toolName: parsed.toolName ?? parsed.name ?? 'unknown',
            success: parsed.success ?? true,
            targetPath: parsed.targetPath ?? parsed.path,
            output: parsed.output ?? parsed.result,
          },
          timestamp: Date.now(),
        });
        return;
      }

      if (parsed.type === 'file.changed' || parsed.type === 'file_change') {
        handle.emitEvent({
          type: 'file_change',
          payload: {
            filePath: parsed.filePath ?? parsed.path ?? '',
            changeType: parsed.changeType ?? 'modify',
          },
          timestamp: Date.now(),
        });
        return;
      }

      if (parsed.type === 'permit.requested' || parsed.type === 'permit_request') {
        handle.emitEvent({
          type: 'permit_request',
          payload: {
            permitId: parsed.permitId ?? `permit_${Date.now()}`,
            toolName: parsed.toolName ?? parsed.name ?? 'unknown',
            description: parsed.description ?? 'Action requires approval',
            targetPath: parsed.targetPath ?? parsed.path,
          },
          timestamp: Date.now(),
        });
        return;
      }

      if (parsed.type === 'session.usage' || parsed.type === 'usage') {
        handle.emitEvent({
          type: 'usage',
          payload: {
            costUsd: parsed.costUsd ?? 0,
            totalSpendUsd: parsed.totalSpendUsd ?? parsed.costUsd ?? 0,
            budgetLimitUsd: parsed.budgetLimitUsd,
          },
          timestamp: Date.now(),
        });
        return;
      }

      // If JSON has text/content property
      if (typeof parsed.content === 'string' || typeof parsed.text === 'string') {
        handle.emitEvent({
          type: 'text_chunk',
          payload: parsed.content ?? parsed.text,
          timestamp: Date.now(),
        });
        return;
      }

      // Default JSON event forward
      handle.emitEvent({
        type: 'raw_stdout',
        payload: trimmed,
        timestamp: Date.now(),
      });
    } catch {
      // Non-JSON line - stream directly as text chunk
      handle.emitEvent({
        type: 'text_chunk',
        payload: trimmed + '\n',
        timestamp: Date.now(),
      });
    }
  }
}
