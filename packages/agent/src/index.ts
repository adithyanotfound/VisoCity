// Agent package placeholder for Claude Agent SDK wrapper
export interface AgentConfig {
  apiKey?: string;
  defaultModel?: 'opus' | 'sonnet' | 'haiku';
}

export function isAgentAvailable(): boolean {
  return true;
}
