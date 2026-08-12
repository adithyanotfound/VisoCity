import { describe, it, expect } from 'vitest';
import { MockAgentEngine } from '../helpers/mock-agent.js';
import type { GameEvent } from '@visoagent/protocol';

describe('Mock Agent SDK Engine Integration Tests', () => {
  it('executes a standard agent session with permit approval flow', async () => {
    const engine = new MockAgentEngine();
    const events: GameEvent[] = [];

    const permitHandler = async (permitId: string, toolName: string) => {
      expect(toolName).toBe('Write');
      expect(permitId).toBeDefined();
      return 'allow' as const;
    };

    const result = await engine.runSession({
      cityId: 'main',
      prompt: 'Implement new database repository',
      onEvent: (event) => {
        events.push(event);
      },
      onPermitRequest: permitHandler,
    });

    expect(result.status).toBe('completed');
    expect(result.totalSpendUsd).toBeGreaterThan(0);

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('session.started');
    expect(eventTypes).toContain('assistant.message');
    expect(eventTypes).toContain('permit.requested');
    expect(eventTypes).toContain('tool.started');
    expect(eventTypes).toContain('file.changed');
    expect(eventTypes).toContain('tool.completed');
    expect(eventTypes).toContain('session.usage');
    expect(eventTypes).toContain('session.finished');

    const finishEvent = events.find((e) => e.type === 'session.finished');
    if (finishEvent && finishEvent.type === 'session.finished') {
      expect(finishEvent.status).toBe('completed');
    }
  });

  it('handles permit denial by stopping tool execution', async () => {
    const engine = new MockAgentEngine();
    const events: GameEvent[] = [];

    const permitHandler = async () => {
      return 'deny' as const;
    };

    const result = await engine.runSession({
      cityId: 'main',
      prompt: 'Dangerous file modification',
      onEvent: (event) => {
        events.push(event);
      },
      onPermitRequest: permitHandler,
    });

    expect(result.status).toBe('completed');

    // Find the tool.completed event after permit denial
    const toolCompletedEvents = events.filter((e) => e.type === 'tool.completed');
    const deniedTool = toolCompletedEvents.find(
      (e) => e.type === 'tool.completed' && e.toolName === 'Write',
    );
    if (deniedTool && deniedTool.type === 'tool.completed') {
      expect(deniedTool.success).toBe(false);
    }
  });

  it('aborts running session on interrupt signal', async () => {
    const engine = new MockAgentEngine();
    const events: GameEvent[] = [];
    const sessionId = 'test-interrupt-session';

    const resultPromise = engine.runSession({
      cityId: 'main',
      sessionId,
      prompt: 'Long running task',
      steps: [
        { type: 'message', textChunk: 'Step 1' },
        { type: 'message', textChunk: 'Step 2' },
        { type: 'message', textChunk: 'Step 3' },
      ],
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'assistant.message' && event.textChunk === 'Step 1') {
          engine.interruptSession(sessionId);
        }
      },
    });

    const result = await resultPromise;
    expect(result.status).toBe('aborted');

    const finishEvent = events.find((e) => e.type === 'session.finished');
    if (finishEvent && finishEvent.type === 'session.finished') {
      expect(finishEvent.status).toBe('aborted');
    }
  });
});
