import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from '../helpers/test-server.js';
import { HealthResponseSchema } from '@visoagent/protocol';

describe('HTTP Server & Health Endpoint Integration Tests', () => {
  let testServer: TestServerInstance;

  beforeAll(async () => {
    testServer = await createTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  it('serves GET /health over real HTTP network socket', async () => {
    const res = await fetch(`${testServer.httpUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const data = await res.json();
    const parsed = HealthResponseSchema.safeParse(data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.version).toBe('0.1.0');
      expect(parsed.data.uptime).toBeGreaterThanOrEqual(0);
      expect(parsed.data.timestamp).toBeDefined();
    }
  });

  it('handles 404 for nonexistent endpoints gracefully', async () => {
    const res = await fetch(`${testServer.httpUrl}/api/unknown/endpoint`);
    expect(res.status).toBe(404);
  });

  it('supports CORS headers for configured web origin', async () => {
    const res = await fetch(`${testServer.httpUrl}/health`, {
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });
});
