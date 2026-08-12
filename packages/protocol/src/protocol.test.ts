import { describe, it, expect } from 'vitest';
import { 
  HealthResponseSchema, 
  MayorCommandSchema, 
  ServerMessageSchema,
  WorldSnapshotSchema,
  BuildingSchema
} from './index.js';

describe('Protocol Schemas', () => {
  it('validates HealthResponse schema', () => {
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
    }
  });

  it('rejects invalid HealthResponse', () => {
    const invalidHealth = {
      status: 'not_ok',
    };
    const parsed = HealthResponseSchema.safeParse(invalidHealth);
    expect(parsed.success).toBe(false);
  });

  it('validates MayorCommandSchema for session.prompt', () => {
    const promptCmd = {
      type: 'session.prompt' as const,
      cityId: 'main',
      prompt: 'Refactor code',
      model: 'sonnet' as const,
      effort: 'high' as const,
      permissionMode: 'default' as const,
      contextPaths: ['src/index.ts'],
    };

    const parsed = MayorCommandSchema.safeParse(promptCmd);
    expect(parsed.success).toBe(true);
  });

  it('validates ServerMessageSchema for cities.roster', () => {
    const rosterMsg = {
      type: 'cities.roster' as const,
      cities: [
        {
          cityId: 'main',
          label: 'Primary City',
          kind: 'main' as const,
          status: 'ready' as const,
        },
      ],
    };

    const parsed = ServerMessageSchema.safeParse(rosterMsg);
    expect(parsed.success).toBe(true);
  });

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
});
