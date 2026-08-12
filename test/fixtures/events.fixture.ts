import type { GameEvent, ServerMessage } from '@visoagent/protocol';
import { mockWorldSnapshot } from './world.fixture.js';
import { mockPullRequestOverlay } from './diff.fixture.js';

export const mockSessionStartedEvent: GameEvent = {
  type: 'session.started',
  cityId: 'main',
  sessionId: 'local-session-1234',
  timestamp: 1718000000000,
};

export const mockAssistantMessageEvent: GameEvent = {
  type: 'assistant.message',
  cityId: 'main',
  textChunk: 'I will inspect the workspace and refactor the auth router.',
};

export const mockToolStartedEvent: GameEvent = {
  type: 'tool.started',
  cityId: 'main',
  toolName: 'Write',
  targetPath: 'src/auth/router.ts',
  input: {
    path: 'src/auth/router.ts',
    content: 'export const router = {};',
  },
};

export const mockToolCompletedEvent: GameEvent = {
  type: 'tool.completed',
  cityId: 'main',
  toolName: 'Write',
  targetPath: 'src/auth/router.ts',
  success: true,
};

export const mockFileChangedEvent: GameEvent = {
  type: 'file.changed',
  cityId: 'main',
  filePath: 'src/auth/router.ts',
  changeType: 'create',
};

export const mockPermitRequestedEvent: GameEvent = {
  type: 'permit.requested',
  cityId: 'main',
  permitId: 'permit-5678',
  toolName: 'Write',
  description: 'Create file src/auth/router.ts',
  targetPath: 'src/auth/router.ts',
};

export const mockSessionUsageEvent: GameEvent = {
  type: 'session.usage',
  cityId: 'main',
  costUsd: 0.015,
  totalSpendUsd: 0.045,
  budgetLimitUsd: 1.0,
};

export const mockSessionFinishedEvent: GameEvent = {
  type: 'session.finished',
  cityId: 'main',
  status: 'completed',
  summary: 'Successfully updated auth router with refresh tokens.',
};

export const mockServerMessageWorldReady: ServerMessage = {
  type: 'world.ready',
  snapshot: mockWorldSnapshot,
};

export const mockServerMessageOverlay: ServerMessage = {
  type: 'overlay',
  overlay: mockPullRequestOverlay,
};

export const mockServerMessageEvent: ServerMessage = {
  type: 'event',
  event: mockToolStartedEvent,
};

export const mockServerMessageCitiesRoster: ServerMessage = {
  type: 'cities.roster',
  cities: [
    {
      cityId: 'main',
      label: 'Primary City (main)',
      kind: 'main',
      status: 'ready',
    },
    {
      cityId: 'pr-42',
      label: 'PR #42: Add spatial audio engine',
      kind: 'pr',
      status: 'ready',
      prNumber: 42,
    },
  ],
};

export const mockServerMessageDiffResponse: ServerMessage = {
  type: 'diff.response',
  filePath: 'src/main.ts',
  unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
};

export const mockServerMessageError: ServerMessage = {
  type: 'error',
  message: 'Failed to locate city worktree for pr-999',
  code: 'CITY_NOT_FOUND',
};
