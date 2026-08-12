import type { FastifyInstance } from 'fastify';
import { buildServer, ServerOptions } from '../../apps/server/src/server.js';
import { TaskService, InMemoryTaskRepository } from '@visoagent/storage';
import type { AddressInfo } from 'node:net';

export interface TestServerInstance {
  server: FastifyInstance;
  port: number;
  httpUrl: string;
  wsUrl: string;
  close: () => Promise<void>;
}

export async function createTestServer(options: ServerOptions = {}): Promise<TestServerInstance> {
  const server = await buildServer({
    logger: false,
    taskService: options.taskService ?? new TaskService(new InMemoryTaskRepository()),
    ...options,
  });

  await server.listen({
    host: '127.0.0.1',
    port: 0,
  });

  const address = server.server.address() as AddressInfo;
  const port = address.port;
  const httpUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  return {
    server,
    port,
    httpUrl,
    wsUrl,
    close: async () => {
      await server.close();
    },
  };
}
