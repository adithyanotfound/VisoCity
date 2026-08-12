import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { MayorCommandSchema, type ServerMessage } from '@visoagent/protocol';
import { AgentSessionManager } from '@visoagent/agent';
import { StorageRepository } from '@visoagent/storage';

export async function websocketRoutes(
  server: FastifyInstance,
  opts?: { sessionManager?: AgentSessionManager },
): Promise<void> {
  const storage = new StorageRepository();
  const sessionManager = opts?.sessionManager ?? new AgentSessionManager({ storage });

  server.get('/ws', { websocket: true }, (socket: WebSocket, _req) => {
    server.log.info('WebSocket client connected');

    // Send initial cities roster
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

    // Global session event listener for this socket connection
    const unsubscribeEvents = sessionManager.onSessionEvent((_sessionId, event) => {
      if (socket.readyState === socket.OPEN) {
        const msg: ServerMessage = {
          type: 'event',
          event,
        };
        socket.send(JSON.stringify(msg));
      }
    });

    socket.on('message', async (rawData: Buffer | string) => {
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

        if (cmd.type === 'session.auth') {
          server.log.info('Mayor session authenticated');
        } else if (cmd.type === 'city.refresh' || cmd.type === 'world.request') {
          socket.send(JSON.stringify(initialRoster));
        } else if (cmd.type === 'session.prompt') {
          const session = sessionManager.createSession({
            cityId: cmd.cityId,
            prompt: cmd.prompt,
            model: cmd.model,
            effort: cmd.effort,
            permissionMode: cmd.permissionMode,
            contextPaths: cmd.contextPaths,
          });

          // Run session in background
          session.start().catch((err: unknown) => {
            server.log.error({ err }, 'Error during agent session execution');
          });
        } else if (cmd.type === 'session.interrupt') {
          const runningSessions = sessionManager.getRunningSessions(cmd.cityId);
          for (const s of runningSessions) {
            await s.cancel('Interrupted by Mayor');
          }
        } else if (cmd.type === 'permit.resolve') {
          sessionManager.resolvePermit(cmd.permitId, cmd.decision, cmd.reason);
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
      unsubscribeEvents();
    });
  });
}
