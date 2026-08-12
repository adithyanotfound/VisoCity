import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import path from 'node:path';
import {
  TaskService,
  SqliteTaskRepository,
  createDatabase,
} from '@visoagent/storage';
import { AppConfig, config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { tasksRoutes } from './routes/tasks.js';
import { websocketRoutes } from './ws/handler.js';

declare module 'fastify' {
  interface FastifyInstance {
    taskService: TaskService;
  }
}

export interface ServerOptions extends FastifyServerOptions {
  appConfig?: AppConfig;
  taskService?: TaskService;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const currentConfig = options.appConfig ?? config;
  const server = Fastify({
    logger: options.logger ?? {
      level: currentConfig.isProduction ? 'info' : 'debug',
      transport: !currentConfig.isProduction ? undefined : undefined,
    },
    ...options,
  });

  // Enable Cross-Origin Resource Sharing
  await server.register(cors, {
    origin: [currentConfig.webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  // Enable WebSocket support
  await server.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB payload ceiling
    },
  });

  // Initialize or attach TaskService
  const taskService =
    options.taskService ??
    new TaskService(
      new SqliteTaskRepository(
        createDatabase({
          dbPath: path.resolve(currentConfig.repoPath, '.visocity/world.db'),
        })
      )
    );

  server.decorate('taskService', taskService);

  // Register Routes
  await server.register(healthRoutes);
  await server.register(tasksRoutes, { taskService });
  await server.register(websocketRoutes);

  return server;
}

export async function startServer(): Promise<FastifyInstance> {
  const server = await buildServer();
  try {
    const address = await server.listen({
      host: config.host,
      port: config.port,
    });
    server.log.info(`VisoAgent server listening on ${address}`);
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
