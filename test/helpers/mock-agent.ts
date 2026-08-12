import type { GameEvent } from '@visoagent/protocol';

export interface MockAgentStep {
  type: 'message' | 'tool_call' | 'usage';
  textChunk?: string;
  toolName?: string;
  targetPath?: string;
  input?: Record<string, unknown>;
  requiresPermit?: boolean;
  costUsd?: number;
}

export interface MockAgentRunOptions {
  cityId: string;
  sessionId?: string;
  prompt: string;
  steps?: MockAgentStep[];
  onEvent: (event: GameEvent) => void;
  onPermitRequest?: (
    permitId: string,
    toolName: string,
    targetPath?: string,
  ) => Promise<'allow' | 'deny'>;
}

export class MockAgentEngine {
  private activeSessions = new Map<string, { aborted: boolean }>();

  public async runSession(
    options: MockAgentRunOptions,
  ): Promise<{ status: 'completed' | 'aborted' | 'error'; totalSpendUsd: number }> {
    const sessionId = options.sessionId ?? `mock-session-${Date.now()}`;
    const sessionState = { aborted: false };
    this.activeSessions.set(sessionId, sessionState);

    let totalSpendUsd = 0;

    // 1. Emit session.started
    options.onEvent({
      type: 'session.started',
      cityId: options.cityId,
      sessionId,
      timestamp: Date.now(),
    });

    const defaultSteps: MockAgentStep[] = options.steps ?? [
      { type: 'message', textChunk: `Processing prompt: "${options.prompt}"` },
      {
        type: 'tool_call',
        toolName: 'Read',
        targetPath: 'src/index.ts',
        input: { path: 'src/index.ts' },
        requiresPermit: false,
      },
      {
        type: 'tool_call',
        toolName: 'Write',
        targetPath: 'src/output.ts',
        input: { path: 'src/output.ts' },
        requiresPermit: true,
      },
      { type: 'usage', costUsd: 0.01 },
    ];

    try {
      for (const step of defaultSteps) {
        if (sessionState.aborted) {
          options.onEvent({
            type: 'session.finished',
            cityId: options.cityId,
            status: 'aborted',
            summary: 'Session was interrupted by Mayor',
          });
          return { status: 'aborted', totalSpendUsd };
        }

        if (step.type === 'message') {
          options.onEvent({
            type: 'assistant.message',
            cityId: options.cityId,
            textChunk: step.textChunk ?? '',
          });
        } else if (step.type === 'tool_call') {
          const toolName = step.toolName ?? 'Read';
          const targetPath = step.targetPath;

          if (step.requiresPermit) {
            const permitId = `permit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            options.onEvent({
              type: 'permit.requested',
              cityId: options.cityId,
              permitId,
              toolName,
              description: `Agent requested execution of ${toolName} on ${targetPath ?? 'target'}`,
              targetPath,
            });

            if (options.onPermitRequest) {
              const decision = await options.onPermitRequest(permitId, toolName, targetPath);
              if (decision === 'deny') {
                options.onEvent({
                  type: 'tool.completed',
                  cityId: options.cityId,
                  toolName,
                  targetPath,
                  success: false,
                });
                continue;
              }
            }
          }

          // Emit tool.started
          options.onEvent({
            type: 'tool.started',
            cityId: options.cityId,
            toolName,
            targetPath,
            input: step.input ?? {},
          });

          if (toolName === 'Write' || toolName === 'Edit') {
            options.onEvent({
              type: 'file.changed',
              cityId: options.cityId,
              filePath: targetPath ?? 'unknown',
              changeType: toolName === 'Write' ? 'create' : 'modify',
            });
          }

          // Emit tool.completed
          options.onEvent({
            type: 'tool.completed',
            cityId: options.cityId,
            toolName,
            targetPath,
            success: true,
          });
        } else if (step.type === 'usage') {
          const cost = step.costUsd ?? 0.01;
          totalSpendUsd += cost;
          options.onEvent({
            type: 'session.usage',
            cityId: options.cityId,
            costUsd: cost,
            totalSpendUsd,
            budgetLimitUsd: 1.0,
          });
        }
      }

      options.onEvent({
        type: 'session.finished',
        cityId: options.cityId,
        status: 'completed',
        summary: 'Agent successfully completed the task',
      });

      return { status: 'completed', totalSpendUsd };
    } catch (err: unknown) {
      const summary = err instanceof Error ? err.message : 'Unknown execution error';
      options.onEvent({
        type: 'session.finished',
        cityId: options.cityId,
        status: 'error',
        summary,
      });
      return { status: 'error', totalSpendUsd };
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  public interruptSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.aborted = true;
      return true;
    }
    return false;
  }
}
