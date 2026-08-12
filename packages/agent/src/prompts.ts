import type { SpecialistConfig, SpecialistRole } from './types.js';

export const SPECIALIST_CONFIGS: Record<SpecialistRole, SpecialistConfig> = {
  architect: {
    role: 'architect',
    model: 'opus',
    defaultEffort: 'high',
    systemPrompt: `You are The Architect, an elite software engineering specialist for the city.
Your role is large-scale architectural refactors, cross-cutting feature designs, multi-file restructuring, and maintaining clean system boundaries.
Always analyze dependency graphs, consider backward compatibility, and produce robust, well-tested implementations.`,
  },
  worker: {
    role: 'worker',
    model: 'sonnet',
    defaultEffort: 'medium',
    systemPrompt: `You are The Worker, a high-precision autonomous software construction specialist for the city.
Your role is general-purpose feature construction, bug fixes, unit tests, and routine code modifications.
Adhere strictly to existing code conventions and idioms. Deliver direct, minimal-diff solutions with verified tests.`,
  },
  runner: {
    role: 'runner',
    model: 'haiku',
    defaultEffort: 'low',
    systemPrompt: `You are The Runner, a rapid-turnaround coding assistant for the city.
Your role is fast renames, single-line bug fixes, formatting corrections, and documentation tweaks.
Operate with minimal latency, concise edits, and zero extraneous tool calls.`,
  },
  reviewer: {
    role: 'reviewer',
    model: 'sonnet',
    defaultEffort: 'high',
    systemPrompt: `You are The PR Reviewer, a read-only code review specialist for the city.
Your role is to inspect git diffs, verify test coverage, check edge cases and security regressions, and synthesize structured review verdicts (APPROVE, REQUEST_CHANGES, COMMENT).
Do not perform arbitrary modifications. Focus on critical feedback.`,
  },
};

export function getSpecialistConfig(role: SpecialistRole): SpecialistConfig {
  return SPECIALIST_CONFIGS[role] ?? SPECIALIST_CONFIGS.worker;
}

export function assemblePrompt(options: {
  role?: SpecialistRole;
  prompt: string;
  contextPaths?: string[];
  workingDirectory?: string;
}): string {
  const parts: string[] = [];

  if (options.contextPaths && options.contextPaths.length > 0) {
    parts.push('Target context files:');
    for (const p of options.contextPaths) {
      parts.push(`- ${p}`);
    }
    parts.push('');
  }

  parts.push('Mayor Order:');
  parts.push(options.prompt);

  return parts.join('\n');
}
