import { describe, it, expect } from 'vitest';
import { isAgentAvailable, AgentConfig } from './index.js';

describe('@visoagent/agent', () => {
  it('reports agent availability', () => {
    expect(isAgentAvailable()).toBe(true);
  });

  it('accepts valid agent configuration', () => {
    const config: AgentConfig = {
      apiKey: 'sk-ant-mock-key',
      defaultModel: 'sonnet',
    };
    expect(config.apiKey).toBe('sk-ant-mock-key');
    expect(config.defaultModel).toBe('sonnet');
  });

  it('supports model specializations', () => {
    const models: NonNullable<AgentConfig['defaultModel']>[] = ['opus', 'sonnet', 'haiku'];
    for (const model of models) {
      const cfg: AgentConfig = { defaultModel: model };
      expect(cfg.defaultModel).toBe(model);
    }
  });
});
