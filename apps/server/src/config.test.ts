import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('Server Configuration Loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads sensible defaults when no env vars are set', () => {
    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.WEB_ORIGIN;
    delete process.env.SUDO_CITY_REPO;
    delete process.env.SUDO_CITY_MAX_BUDGET_USD;

    const config = loadConfig();
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4100);
    expect(config.webOrigin).toBe('http://127.0.0.1:5173');
    expect(config.maxBudgetUsd).toBe(1.0);
    expect(typeof config.repoPath).toBe('string');
  });

  it('respects custom environment variables', () => {
    process.env.HOST = '0.0.0.0';
    process.env.PORT = '8080';
    process.env.WEB_ORIGIN = 'https://visoagent.app';
    process.env.SUDO_CITY_REPO = '/custom/repo/path';
    process.env.SUDO_CITY_MAX_BUDGET_USD = '5.50';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    const config = loadConfig();
    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
    expect(config.webOrigin).toBe('https://visoagent.app');
    expect(config.repoPath).toBe('/custom/repo/path');
    expect(config.maxBudgetUsd).toBe(5.5);
    expect(config.anthropicApiKey).toBe('sk-ant-test-key');
  });

  it('throws on invalid configuration values (e.g. invalid port)', () => {
    process.env.PORT = 'invalid-port-number';

    expect(() => loadConfig()).toThrow('Invalid environment configuration');
  });
});
