import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server.js';
import { HealthResponseSchema, type ServerMessage } from '@visoagent/protocol';

describe('Server Scaffold & Health Endpoint', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({
      logger: false,
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('responds with 200 OK and valid payload on GET /health', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    const parsed = HealthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.version).toBe('0.1.0');
      expect(parsed.data.timestamp).toBeDefined();
      expect(typeof parsed.data.uptime).toBe('number');
    }
  });

  it('returns 404 for unknown routes', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/non-existent-route',
    });

    expect(response.statusCode).toBe(404);
  });

  it('handles WebSocket connections and receives initial roster', async () => {
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    const wsUrl = address.replace('http://', 'ws://') + '/ws';
    const { WebSocket } = await import('ws');

    const ws = new WebSocket(wsUrl);

    const receivedMessages: ServerMessage[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        // Connected
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString('utf-8')) as ServerMessage;
        receivedMessages.push(msg);
        if (msg.type === 'cities.roster') {
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
    });

    expect(receivedMessages.length).toBeGreaterThan(0);
    const firstMsg = receivedMessages[0];
    expect(firstMsg?.type).toBe('cities.roster');
    if (firstMsg?.type === 'cities.roster') {
      expect(firstMsg.cities[0]?.cityId).toBe('main');
    }
  });
});
