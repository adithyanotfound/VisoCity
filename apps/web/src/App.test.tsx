// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { App } from './App.js';

describe('App Minimal Frontend Shell', () => {
  let mockSocketInstance: MockWebSocket;

  class MockWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    send = vi.fn();
    close = vi.fn();

    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      mockSocketInstance = this;
    }
  }

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

  it('allows user to type a prompt and dispatch an order', async () => {
    await act(async () => {
      render(<App />);
    });

    const input = screen.getByPlaceholderText(/Issue natural language instructions/i);
    const dispatchButton = screen.getByRole('button', { name: /DISPATCH/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Refactor database models' } });
    });

    await act(async () => {
      fireEvent.click(dispatchButton);
    });

    expect(
      screen.getByText(/MAYOR ORDER \[WORKER\/HIGH\]: Refactor database models/i),
    ).toBeTruthy();
  });

  it('allows selecting different specialists and effort levels', async () => {
    await act(async () => {
      render(<App />);
    });

    const specialistSelect = screen.getByDisplayValue(/Worker \(Sonnet\)/i);
    const effortSelect = screen.getByDisplayValue(/High Effort/i);

    await act(async () => {
      fireEvent.change(specialistSelect, { target: { value: 'architect' } });
      fireEvent.change(effortSelect, { target: { value: 'max' } });
    });

    const input = screen.getByPlaceholderText(/Issue natural language instructions/i);
    const dispatchButton = screen.getByRole('button', { name: /DISPATCH/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Redesign architecture' } });
      fireEvent.click(dispatchButton);
    });

    expect(screen.getByText(/MAYOR ORDER \[ARCHITECT\/MAX\]: Redesign architecture/i)).toBeTruthy();
  });

  it('handles WebSocket messages and updates the transmissions log', async () => {
    await act(async () => {
      render(<App />);
    });

    // Simulate WebSocket open
    await act(async () => {
      mockSocketInstance.onopen?.();
    });

    expect(screen.getByText(/WebSocket stream connected/i)).toBeTruthy();

    // Simulate server roster message
    await act(async () => {
      mockSocketInstance.onmessage?.({
        data: JSON.stringify({
          type: 'cities.roster',
          cities: [{ cityId: 'main', label: 'Primary City', kind: 'main', status: 'ready' }],
        }),
      } as MessageEvent);
    });

    expect(screen.getByText(/Discovered 1 city sector/i)).toBeTruthy();
  });
});
