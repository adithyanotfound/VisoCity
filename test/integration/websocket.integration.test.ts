import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from '../helpers/test-server.js';
import { TestWebSocketClient } from '../helpers/ws-client.js';
import type { MayorCommand } from '@visoagent/protocol';

describe('Fastify WebSocket Integration Tests', () => {
  let testServer: TestServerInstance;

  beforeAll(async () => {
    testServer = await createTestServer();
  });

  afterAll(async () => {
    await testServer.close();
  });

  it('establishes a WebSocket connection and receives initial cities.roster', async () => {
    const client = new TestWebSocketClient(testServer.wsUrl);
    await client.connect();

    const initialMsg = await client.waitForMessageType('cities.roster');
    expect(initialMsg.type).toBe('cities.roster');
    expect(initialMsg.cities.length).toBeGreaterThan(0);
    expect(initialMsg.cities[0].cityId).toBe('main');

    await client.close();
  });

  it('handles session.auth and responds to world.request', async () => {
    const client = new TestWebSocketClient(testServer.wsUrl);
    await client.connect();

    // Consume initial roster
    await client.waitForMessageType('cities.roster');

    // Send auth command
    const authCmd: MayorCommand = {
      type: 'session.auth',
      token: 'test-token-12345',
    };
    client.send(authCmd);

    // Send world.request
    const worldCmd: MayorCommand = {
      type: 'world.request',
      cityId: 'main',
    };
    client.send(worldCmd);

    const rosterMsg = await client.waitForMessageType('cities.roster');
    expect(rosterMsg.cities).toBeDefined();

    await client.close();
  });

  it('returns structured error on invalid MayorCommand schema', async () => {
    const client = new TestWebSocketClient(testServer.wsUrl);
    await client.connect();
    await client.waitForMessageType('cities.roster');

    // Send invalid command
    client.send({
      type: 'invalid.command.name',
      foo: 'bar',
    });

    const errorMsg = await client.waitForMessageType('error');
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.code).toBe('INVALID_COMMAND');
    expect(errorMsg.message).toContain('Invalid command payload');

    await client.close();
  });

  it('returns structured error on malformed non-JSON frame', async () => {
    const client = new TestWebSocketClient(testServer.wsUrl);
    await client.connect();
    await client.waitForMessageType('cities.roster');

    // Send non-JSON text
    client.send('{ bad json frame');

    const errorMsg = await client.waitForMessageType('error');
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.code).toBe('MALFORMED_JSON');

    await client.close();
  });

  it('handles multiple concurrent WebSocket connections independently', async () => {
    const client1 = new TestWebSocketClient(testServer.wsUrl);
    const client2 = new TestWebSocketClient(testServer.wsUrl);

    await Promise.all([client1.connect(), client2.connect()]);

    const [msg1, msg2] = await Promise.all([
      client1.waitForMessageType('cities.roster'),
      client2.waitForMessageType('cities.roster'),
    ]);

    expect(msg1.cities[0].cityId).toBe('main');
    expect(msg2.cities[0].cityId).toBe('main');

    await Promise.all([client1.close(), client2.close()]);
  });
});
