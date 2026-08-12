import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@visoagent/protocol';
import { config } from '../config.js';

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Reply: HealthResponse }>('/health', async (_req, reply) => {
    const health: HealthResponse = {
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      repoPath: config.repoPath,
    };

    return reply.status(200).send(health);
  });
}
