import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { MayorCommandSchema, ServerMessage } from '@visoagent/protocol';

export async function websocketRoutes(server: FastifyInstance): Promise<void> {
  server.get('/ws', { websocket: true }, (socket: WebSocket, _req) => {
    server.log.info('WebSocket client connected');

    // Send initial cities roster or welcome status
    const initialRoster: ServerMessage = {
      type: 'cities.roster',
      cities: [
        {
          cityId: 'main',
          label: 'Primary City (main)',
          kind: 'main',
          status: 'ready',
        },
      ],
    };
    socket.send(JSON.stringify(initialRoster));

    socket.on('message', (rawData: Buffer | string) => {
      try {
        const text = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
        const parsedJson = JSON.parse(text);
        const commandResult = MayorCommandSchema.safeParse(parsedJson);

        if (!commandResult.success) {
          const errorMsg: ServerMessage = {
            type: 'error',
            message: `Invalid command payload: ${commandResult.error.message}`,
            code: 'INVALID_COMMAND',
          };
          socket.send(JSON.stringify(errorMsg));
          return;
        }

        const cmd = commandResult.data;
        server.log.info({ type: cmd.type }, 'Received MayorCommand');

        // Handle basic commands for scaffold
        if (cmd.type === 'session.auth') {
          server.log.info('Mayor session authenticated');
        } else if (cmd.type === 'city.refresh' || cmd.type === 'world.request') {
          socket.send(JSON.stringify(initialRoster));
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        server.log.error({ err }, 'Error processing WebSocket frame');
        const errorMsg: ServerMessage = {
          type: 'error',
          message: `Malformed JSON payload: ${errorMessage}`,
          code: 'MALFORMED_JSON',
        };
        socket.send(JSON.stringify(errorMsg));
      }
    });

    socket.on('close', () => {
      server.log.info('WebSocket client disconnected');
    });
  });
}
