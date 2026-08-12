import { describe, it, expect } from 'vitest';
import {
  WorldSnapshotSchema,
  PullRequestOverlaySchema,
  GameEventSchema,
  ServerMessageSchema,
  MayorCommandSchema,
} from '@visoagent/protocol';
import {
  mockWorldSnapshot,
  mockEmptyWorldSnapshot,
  mockPullRequestOverlay,
  mockSessionStartedEvent,
  mockAssistantMessageEvent,
  mockToolStartedEvent,
  mockToolCompletedEvent,
  mockFileChangedEvent,
  mockPermitRequestedEvent,
  mockSessionUsageEvent,
  mockSessionFinishedEvent,
  mockServerMessageWorldReady,
  mockServerMessageOverlay,
  mockServerMessageEvent,
  mockServerMessageCitiesRoster,
  mockServerMessageDiffResponse,
  mockServerMessageError,
  mockAuthCommand,
  mockRepoSelectCommand,
  mockPromptCommand,
  mockInterruptCommand,
  mockPermitResolveAllowCommand,
  mockPermitResolveDenyCommand,
  mockCityTravelCommand,
  mockCityRefreshCommand,
  mockWorldRequestCommand,
  mockDiffRequestCommand,
} from '../fixtures/index.js';

describe('Shared Test Fixtures Integrity & Schema Conformance', () => {
  it('validates world snapshot fixtures against WorldSnapshotSchema', () => {
    expect(WorldSnapshotSchema.safeParse(mockWorldSnapshot).success).toBe(true);
    expect(WorldSnapshotSchema.safeParse(mockEmptyWorldSnapshot).success).toBe(true);
  });

  it('validates PR overlay fixture against PullRequestOverlaySchema', () => {
    expect(PullRequestOverlaySchema.safeParse(mockPullRequestOverlay).success).toBe(true);
  });

  it('validates all GameEvent fixtures against GameEventSchema', () => {
    const events = [
      mockSessionStartedEvent,
      mockAssistantMessageEvent,
      mockToolStartedEvent,
      mockToolCompletedEvent,
      mockFileChangedEvent,
      mockPermitRequestedEvent,
      mockSessionUsageEvent,
      mockSessionFinishedEvent,
    ];

    for (const evt of events) {
      const parsed = GameEventSchema.safeParse(evt);
      expect(parsed.success).toBe(true);
    }
  });

  it('validates all ServerMessage fixtures against ServerMessageSchema', () => {
    const messages = [
      mockServerMessageWorldReady,
      mockServerMessageOverlay,
      mockServerMessageEvent,
      mockServerMessageCitiesRoster,
      mockServerMessageDiffResponse,
      mockServerMessageError,
    ];

    for (const msg of messages) {
      const parsed = ServerMessageSchema.safeParse(msg);
      expect(parsed.success).toBe(true);
    }
  });

  it('validates all MayorCommand fixtures against MayorCommandSchema', () => {
    const commands = [
      mockAuthCommand,
      mockRepoSelectCommand,
      mockPromptCommand,
      mockInterruptCommand,
      mockPermitResolveAllowCommand,
      mockPermitResolveDenyCommand,
      mockCityTravelCommand,
      mockCityRefreshCommand,
      mockWorldRequestCommand,
      mockDiffRequestCommand,
    ];

    for (const cmd of commands) {
      const parsed = MayorCommandSchema.safeParse(cmd);
      expect(parsed.success).toBe(true);
    }
  });
});
