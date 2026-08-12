import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { AppConfig, config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { websocketRoutes } from './ws/handler.js';

export interface ServerOptions extends FastifyServerOptions {
  appConfig?: AppConfig;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const currentConfig = options.appConfig ?? config;
  const server = Fastify({
    logger: options.logger ?? {
      level: currentConfig.isProduction ? 'info' : 'debug',
      transport: !currentConfig.isProduction
        ? undefined
        : undefined,
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

  // Register Routes
  await server.register(healthRoutes);
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
