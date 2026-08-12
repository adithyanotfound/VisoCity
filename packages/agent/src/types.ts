import type { SessionRecord, SessionStatus } from '@visoagent/storage';

export type { SessionRecord, SessionStatus };

export type SpecialistRole = 'architect' | 'worker' | 'runner' | 'reviewer';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export type PermissionMode = 'default' | 'auto';

export interface AgentConfig {
  apiKey?: string;
  defaultModel?: 'opus' | 'sonnet' | 'haiku';
}

export function isAgentAvailable(): boolean {
  return true;
}

export interface SpecialistConfig {
  role: SpecialistRole;
  model: string;
  defaultEffort: ReasoningEffort;
  systemPrompt: string;
}

export interface CreateSessionOptions {
  sessionId?: string;
  cityId: string;
  prompt: string;
  model?: string;
  effort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  contextPaths?: string[];
  workingDirectory?: string;
  metadata?: Record<string, unknown>;
  runner?: AgentRunner;
  timeoutMs?: number;
}

export interface AgentRunnerOptions {
  sessionId: string;
  cityId: string;
  prompt: string;
  model?: string;
  effort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  contextPaths?: string[];
  workingDirectory?: string;
  systemPrompt?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export type AgentRunnerEventType =
  | 'text_chunk'
  | 'tool_start'
  | 'tool_end'
  | 'file_change'
  | 'permit_request'
  | 'usage'
  | 'raw_stdout'
  | 'raw_stderr'
  | 'error';

export interface ToolStartPayload {
  toolName: string;
  input: Record<string, unknown>;
  targetPath?: string;
}

export interface ToolEndPayload {
  toolName: string;
  success: boolean;
  targetPath?: string;
  output?: string;
}

export interface FileChangePayload {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete';
}

export interface PermitRequestPayload {
  permitId: string;
  toolName: string;
  description: string;
  targetPath?: string;
}

export interface UsagePayload {
  costUsd: number;
  totalSpendUsd: number;
  budgetLimitUsd?: number;
}

export interface AgentRunnerEvent {
  type: AgentRunnerEventType;
  payload:
    | string
    | ToolStartPayload
    | ToolEndPayload
    | FileChangePayload
    | PermitRequestPayload
    | UsagePayload
    | Record<string, unknown>;
  timestamp: number;
}

export interface AgentExitResult {
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
  timedOut?: boolean;
  rawOutput?: string;
}

export interface AgentExecutionHandle {
  readonly pid?: number;
  readonly isAlive: boolean;
  kill(signal?: NodeJS.Signals): Promise<void>;
  sendInput?(input: string): Promise<void>;
  onEvent(listener: (event: AgentRunnerEvent) => void): () => void;
  wait(): Promise<AgentExitResult>;
}

export interface AgentRunner {
  readonly name: string;
  start(options: AgentRunnerOptions): Promise<AgentExecutionHandle>;
}

export interface SessionFinishedPayload {
  status: 'completed' | 'aborted' | 'error';
  summary?: string;
  error?: Error;
  exitCode?: number | null;
}
