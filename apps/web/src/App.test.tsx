// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { App } from './App.js';

describe('App Minimal Frontend Shell', () => {
  beforeEach(() => {
    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        repoPath: '/workspace/test-repo',
      }),
    } as Response);

    // Mock global WebSocket
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
    }

    // @ts-expect-error Mocking WebSocket for test environment
    global.WebSocket = MockWebSocket;
  });

  it('renders the header with VisoAgent branding and telemetry', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('VISOAGENT')).toBeTruthy();
    expect(screen.getByText('CLAUDE CITY')).toBeTruthy();
    expect(screen.getByText(/TREASURY:/i)).toBeTruthy();
  });

  it('renders the Mayor Order dispatcher form and specialist selector', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText(/Mayor's Construction Order/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Issue natural language instructions/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /DISPATCH/i })).toBeTruthy();
  });

  it('renders the Isometric Spatial Canvas shell placeholder', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('Isometric Spatial Canvas Shell')).toBeTruthy();
  });
});
