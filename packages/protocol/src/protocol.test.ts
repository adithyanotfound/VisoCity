import { describe, it, expect } from 'vitest';
import {
  HealthResponseSchema,
  MayorCommandSchema,
  ServerMessageSchema,
  GameEventSchema,
  WorldSnapshotSchema,
  DistrictSchema,
  BuildingSchema,
  PullRequestOverlaySchema,
  FileDiffEntrySchema,
  CitySummarySchema,
} from './index.js';

describe('Protocol Schemas', () => {
  describe('HealthResponseSchema', () => {
    it('validates a correct HealthResponse payload', () => {
      const validHealth = {
        status: 'ok' as const,
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        uptime: 42,
        repoPath: '/tmp/repo',
      };

      const parsed = HealthResponseSchema.safeParse(validHealth);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('ok');
        expect(parsed.data.version).toBe('0.1.0');
        expect(parsed.data.uptime).toBe(42);
        expect(parsed.data.repoPath).toBe('/tmp/repo');
      }
    });

    it('rejects an invalid HealthResponse with incorrect status', () => {
      const invalidHealth = {
        status: 'not_ok',
      };
      const parsed = HealthResponseSchema.safeParse(invalidHealth);
      expect(parsed.success).toBe(false);
    });
  });

  describe('MayorCommandSchema', () => {
    it('validates session.auth command', () => {
      const cmd = {
        type: 'session.auth' as const,
        token: 'auth-token-123',
      };
      const result = MayorCommandSchema.safeParse(cmd);
      expect(result.success).toBe(true);
    });

    it('validates repo.select command', () => {
      const cmd = {
        type: 'repo.select' as const,
        repoPath: '/workspace/project',
      };
      const result = MayorCommandSchema.safeParse(cmd);
      expect(result.success).toBe(true);
    });

    it('validates session.prompt command with all options', () => {
      const cmd = {
        type: 'session.prompt' as const,
        cityId: 'main',
        prompt: 'Refactor code',
        model: 'sonnet' as const,
        effort: 'high' as const,
        permissionMode: 'default' as const,
        contextPaths: ['src/index.ts', 'src/utils.ts'],
      };
      const result = MayorCommandSchema.safeParse(cmd);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'session.prompt') {
        expect(result.data.model).toBe('sonnet');
        expect(result.data.effort).toBe('high');
      }
    });

    it('validates session.interrupt command', () => {
      const cmd = {
        type: 'session.interrupt' as const,
        cityId: 'main',
      };
      const result = MayorCommandSchema.safeParse(cmd);
      expect(result.success).toBe(true);
    });

    it('validates permit.resolve allow and deny commands', () => {
      const allowCmd = {
        type: 'permit.resolve' as const,
        permitId: 'p-1',
        decision: 'allow' as const,
      };
      const denyCmd = {
        type: 'permit.resolve' as const,
        permitId: 'p-2',
        decision: 'deny' as const,
        reason: 'Restricted path',
      };

      expect(MayorCommandSchema.safeParse(allowCmd).success).toBe(true);
      expect(MayorCommandSchema.safeParse(denyCmd).success).toBe(true);
    });

    it('validates city.travel and city.refresh commands', () => {
      const travelCmd = {
        type: 'city.travel' as const,
        cityId: 'pr-42',
      };
      const refreshCmd = {
        type: 'city.refresh' as const,
        cityId: 'main',
      };

      expect(MayorCommandSchema.safeParse(travelCmd).success).toBe(true);
      expect(MayorCommandSchema.safeParse(refreshCmd).success).toBe(true);
    });

    it('validates world.request and diff.request commands', () => {
      const worldReq = {
        type: 'world.request' as const,
        cityId: 'main',
      };
      const diffReq = {
        type: 'diff.request' as const,
        cityId: 'pr-42',
        filePath: 'src/main.ts',
      };

      expect(MayorCommandSchema.safeParse(worldReq).success).toBe(true);
      expect(MayorCommandSchema.safeParse(diffReq).success).toBe(true);
    });

    it('rejects unknown command type', () => {
      const unknownCmd = {
        type: 'unknown.command',
        data: 'test',
      };
      expect(MayorCommandSchema.safeParse(unknownCmd).success).toBe(false);
    });

    it('rejects session.prompt with invalid model or missing prompt', () => {
      const invalidModel = {
        type: 'session.prompt',
        cityId: 'main',
        prompt: 'test',
        model: 'gpt-4',
        effort: 'high',
        permissionMode: 'default',
        contextPaths: [],
      };
      expect(MayorCommandSchema.safeParse(invalidModel).success).toBe(false);

      const missingPrompt = {
        type: 'session.prompt',
        cityId: 'main',
        model: 'sonnet',
        effort: 'high',
        permissionMode: 'default',
        contextPaths: [],
      };
      expect(MayorCommandSchema.safeParse(missingPrompt).success).toBe(false);
    });
  });

  describe('GameEventSchema', () => {
    it('validates session.started event', () => {
      const evt = {
        type: 'session.started' as const,
        cityId: 'main',
        sessionId: 's-1',
        timestamp: 1234567890,
      };
      expect(GameEventSchema.safeParse(evt).success).toBe(true);
    });

    it('validates assistant.message event', () => {
      const evt = {
        type: 'assistant.message' as const,
        cityId: 'main',
        textChunk: 'Hello world',
      };
      expect(GameEventSchema.safeParse(evt).success).toBe(true);
    });

    it('validates tool.started and tool.completed events', () => {
      const toolStarted = {
        type: 'tool.started' as const,
        cityId: 'main',
        toolName: 'Read',
        targetPath: 'src/file.ts',
        input: { path: 'src/file.ts' },
      };
      const toolCompleted = {
        type: 'tool.completed' as const,
        cityId: 'main',
        toolName: 'Read',
        targetPath: 'src/file.ts',
        success: true,
      };

      expect(GameEventSchema.safeParse(toolStarted).success).toBe(true);
      expect(GameEventSchema.safeParse(toolCompleted).success).toBe(true);
    });

    it('validates file.changed event with create, modify, delete', () => {
      const created = {
        type: 'file.changed' as const,
        cityId: 'main',
        filePath: 'src/new.ts',
        changeType: 'create' as const,
      };
      const modified = {
        type: 'file.changed' as const,
        cityId: 'main',
        filePath: 'src/edit.ts',
        changeType: 'modify' as const,
      };
      const deleted = {
        type: 'file.changed' as const,
        cityId: 'main',
        filePath: 'src/old.ts',
        changeType: 'delete' as const,
      };

      expect(GameEventSchema.safeParse(created).success).toBe(true);
      expect(GameEventSchema.safeParse(modified).success).toBe(true);
      expect(GameEventSchema.safeParse(deleted).success).toBe(true);
    });

    it('validates permit.requested, session.usage, and session.finished events', () => {
      const permitReq = {
        type: 'permit.requested' as const,
        cityId: 'main',
        permitId: 'perm-1',
        toolName: 'Write',
        description: 'Create file',
        targetPath: 'src/file.ts',
      };
      const usage = {
        type: 'session.usage' as const,
        cityId: 'main',
        costUsd: 0.01,
        totalSpendUsd: 0.05,
        budgetLimitUsd: 1.0,
      };
      const finished = {
        type: 'session.finished' as const,
        cityId: 'main',
        status: 'completed' as const,
        summary: 'Done',
      };

      expect(GameEventSchema.safeParse(permitReq).success).toBe(true);
      expect(GameEventSchema.safeParse(usage).success).toBe(true);
      expect(GameEventSchema.safeParse(finished).success).toBe(true);
    });

    it('rejects invalid game event', () => {
      const invalid = {
        type: 'invalid.event.type',
      };
      expect(GameEventSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('ServerMessageSchema', () => {
    it('validates cities.roster message', () => {
      const msg = {
        type: 'cities.roster' as const,
        cities: [
          {
            cityId: 'main',
            label: 'Primary City',
            kind: 'main' as const,
            status: 'ready' as const,
          },
          {
            cityId: 'pr-42',
            label: 'PR #42',
            kind: 'pr' as const,
            status: 'ready' as const,
            prNumber: 42,
          },
        ],
      };
      expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('validates diff.response and error messages', () => {
      const diffMsg = {
        type: 'diff.response' as const,
        filePath: 'src/main.ts',
        unifiedDiff: '@@ -1 +1 @@\n-a\n+b',
      };
      const errorMsg = {
        type: 'error' as const,
        message: 'Something went wrong',
        code: 'ERR_FAIL',
      };

      expect(ServerMessageSchema.safeParse(diffMsg).success).toBe(true);
      expect(ServerMessageSchema.safeParse(errorMsg).success).toBe(true);
    });
  });

  describe('World, District, Building, and Diff Schemas', () => {
    it('validates BuildingSchema geometry and coordinates', () => {
      const building = {
        id: 'b-1',
        path: 'src/main.ts',
        filename: 'main.ts',
        districtId: 'dist-src',
        language: 'typescript',
        colorHex: '#3178c6',
        loc: 120,
        gridX: 10,
        gridY: 15,
        width: 2,
        height: 2,
        elevation: 4,
      };

      const parsed = BuildingSchema.safeParse(building);
      expect(parsed.success).toBe(true);
    });

    it('rejects BuildingSchema with negative loc', () => {
      const invalidBuilding = {
        id: 'b-1',
        path: 'src/main.ts',
        filename: 'main.ts',
        districtId: 'dist-src',
        language: 'typescript',
        colorHex: '#3178c6',
        loc: -5,
        gridX: 10,
        gridY: 15,
        width: 2,
        height: 2,
        elevation: 4,
      };

      expect(BuildingSchema.safeParse(invalidBuilding).success).toBe(false);
    });

    it('validates DistrictSchema and WorldSnapshotSchema', () => {
      const district = {
        id: 'dist-1',
        path: 'src',
        name: 'src',
        loc: 200,
        gridX: 0,
        gridY: 0,
        width: 10,
        height: 10,
        colorHex: '#3b82f6',
      };
      expect(DistrictSchema.safeParse(district).success).toBe(true);

      const snapshot = {
        cityId: 'main',
        repoName: 'test-repo',
        commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
        totalLoc: 200,
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        districts: [district],
        buildings: [],
        roads: [{ from: { x: 0, y: 0 }, to: { x: 5, y: 5 } }],
      };
      expect(WorldSnapshotSchema.safeParse(snapshot).success).toBe(true);
    });

    it('validates PullRequestOverlaySchema and FileDiffEntrySchema', () => {
      const diffEntry = {
        path: 'src/index.ts',
        status: 'modified' as const,
        insertions: 10,
        deletions: 2,
      };
      expect(FileDiffEntrySchema.safeParse(diffEntry).success).toBe(true);

      const overlay = {
        cityId: 'pr-10',
        prNumber: 10,
        title: 'feat: add awesome feature',
        author: 'developer',
        baseSha: 'base-sha',
        headSha: 'head-sha',
        changedFiles: [diffEntry],
      };
      expect(PullRequestOverlaySchema.safeParse(overlay).success).toBe(true);
    });

    it('validates CitySummarySchema', () => {
      const city = {
        cityId: 'issue-15',
        label: 'Issue #15: Fix memory leak',
        kind: 'issue' as const,
        status: 'idle' as const,
      };
      expect(CitySummarySchema.safeParse(city).success).toBe(true);
    });
  });
});
