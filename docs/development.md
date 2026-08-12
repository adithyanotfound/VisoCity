# Development & Testing Guide

This document provides a comprehensive guide for setting up, developing, testing, and contributing to **VisoAgent (Claude City)**.

---

## Table of Contents

1. [Architecture & Monorepo Topology](#1-architecture--monorepo-topology)
2. [Prerequisites](#2-prerequisites)
3. [Quickstart & Environment Setup](#3-quickstart--environment-setup)
4. [Running the Application](#4-running-the-application)
5. [Testing Strategy & Test Framework](#5-testing-strategy--test-framework)
   - [Running Tests](#51-running-tests)
   - [Unit Test Framework](#52-unit-test-framework)
   - [Integration Test Framework](#53-integration-test-framework)
   - [Code Coverage](#54-code-coverage)
6. [Test Fixtures & Utilities](#6-test-fixtures--utilities)
   - [Shared Test Fixtures](#61-shared-test-fixtures)
   - [Test WebSocket Client Helper](#62-test-websocket-client-helper)
   - [Mock Claude Agent SDK Harness](#63-mock-claude-agent-sdk-harness)
   - [Ephemeral Test Server Helper](#64-ephemeral-test-server-helper)
   - [Temporary Filesystem Utility](#65-temporary-filesystem-utility)
7. [Code Quality & Formatting](#7-code-quality--formatting)
   - [Type Checking](#71-type-checking)
   - [ESLint Linting](#72-eslint-linting)
   - [Prettier Formatting](#73-prettier-formatting)
8. [Continuous Integration (CI)](#8-continuous-integration-ci)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. Architecture & Monorepo Topology

VisoAgent is organized as a `pnpm` monorepo with strict package boundaries:

```
├── apps/
│   ├── server/                  # Fastify 5 + WebSocket backend
│   └── web/                     # React 19 + Phaser 3 + Vite frontend
├── packages/
│   ├── protocol/                # Shared Zod schemas, TypeScript types, constants
│   ├── worldgen/                # Repository scanner & metric collector
│   ├── layout/                  # Deterministic squarified block treemap layout engine
│   ├── storage/                 # Embedded SQLite persistence (.visocity/world.db)
│   ├── git/                     # Git worktree & GitHub API/CLI client
│   └── agent/                   # Claude Agent SDK wrapper & specialist prompts
├── test/
│   ├── fixtures/                # Shared test data & protocol fixtures
│   ├── helpers/                 # Test WebSocket client, mock agent harness, test server
│   └── integration/             # End-to-end and subsystem integration tests
└── docs/                        # Architecture & development documentation
```

---

## 2. Prerequisites

- **Node.js**: `>= 22.0.0` (ES Modules and `node:sqlite` support)
- **pnpm**: `>= 10.x` (`corepack enable` or `npm install -g pnpm`)
- **Git**: `>= 2.30.0` (Worktree support)

---

## 3. Quickstart & Environment Setup

### 3.1. Clone & Install Dependencies

```bash
git clone https://github.com/adithyanotfound/visoagent.git
cd visoagent
pnpm install
```

### 3.2. Configure Environment

Copy the example environment configuration:

```bash
cp .env.example .env
```

Key environment configuration variables:

| Variable                   | Default                   | Purpose                                      |
| -------------------------- | ------------------------- | -------------------------------------------- |
| `HOST`                     | `127.0.0.1`               | Network interface for backend server binding |
| `PORT`                     | `4100`                    | Port for backend server                      |
| `WEB_ORIGIN`               | `http://127.0.0.1:5173`   | Allowed origin for CORS headers              |
| `SUDO_CITY_REPO`           | Current working directory | Root repository directory for demo city      |
| `SUDO_CITY_MAX_BUDGET_USD` | `1.00`                    | Treasury spend ceiling in USD                |
| `ANTHROPIC_API_KEY`        | _(Optional)_              | Anthropic API key for Claude Agent SDK       |

---

## 4. Running the Application

### Full Stack (Backend + Frontend in parallel):

```bash
pnpm dev
```

### Backend Server Only:

```bash
pnpm dev:server
```

- Server URL: `http://127.0.0.1:4100`
- Health Probe: `http://127.0.0.1:4100/health`
- WebSocket Stream: `ws://127.0.0.1:4100/ws`

### Frontend Client Only:

```bash
pnpm dev:web
```

- Web Client URL: `http://127.0.0.1:5173`

---

## 5. Testing Strategy & Test Framework

VisoAgent uses [Vitest](https://vitest.dev/) as its test runner with native ES Modules, TypeScript, and v8 coverage analysis.

### 5.1. Running Tests

| Command                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `pnpm test`             | Runs the complete test suite (unit + integration)   |
| `pnpm test:unit`        | Runs unit tests across packages and apps            |
| `pnpm test:integration` | Runs subsystem and protocol integration tests       |
| `pnpm test:coverage`    | Runs test suite and outputs v8 code coverage report |
| `pnpm test:watch`       | Starts Vitest in interactive watch mode             |

### 5.2. Unit Test Framework

Unit tests are co-located alongside code in `packages/**/src/*.test.ts` and `apps/**/src/*.test.{ts,tsx}`:

- **Protocol Tests** (`packages/protocol/src/protocol.test.ts`):
  - Validates Zod schema definitions (`MayorCommand`, `GameEvent`, `ServerMessage`, `WorldSnapshot`, `PullRequestOverlay`, `District`, `Building`, `HealthResponse`).
  - Asserts that invalid inputs are rejected with descriptive error payloads.
- **Server Config Tests** (`apps/server/src/config.test.ts`):
  - Asserts default environment fallback values and custom overrides.
- **Web UI Tests** (`apps/web/src/App.test.tsx`):
  - Validates HUD rendering, specialist & effort selectors, order form dispatching, and WebSocket telemetry status.
- **Domain Package Tests**:
  - Tests for `agent`, `git`, `layout`, `storage`, and `worldgen`.

### 5.3. Integration Test Framework

Integration tests reside in `test/integration/` and test multi-module interactions:

- **WebSocket Integration** (`test/integration/websocket.integration.test.ts`):
  - Boots an ephemeral Fastify server with WebSocket support.
  - Tests client connection handshake, `session.auth`, `world.request`, `city.refresh`.
  - Tests error handling for malformed JSON and invalid command schemas.
  - Tests multi-client concurrency.
- **HTTP Server Integration** (`test/integration/health.integration.test.ts`):
  - Validates live HTTP requests, status codes, CORS headers, and 404 handlers.
- **Mock Agent Engine Integration** (`test/integration/mock-agent.integration.test.ts`):
  - Simulates the full Claude Agent SDK streaming query loop, gated tool permit requests, human-in-the-loop Stamp/Deny resolutions, and interruption signals.
- **Fixture Conformance** (`test/integration/fixtures.integration.test.ts`):
  - Ensures all shared mock data fixtures strictly conform to current Zod schemas.

### 5.4. Code Coverage

Run coverage with:

```bash
pnpm test:coverage
```

Coverage thresholds are configured in `vitest.config.ts` targeting `>= 70%` line coverage and statement coverage. HTML reports are generated in `coverage/index.html`.

---

## 6. Test Fixtures & Utilities

To ensure consistent testing across the monorepo, shared test fixtures and helpers are provided in `test/fixtures/` and `test/helpers/`.

### 6.1. Shared Test Fixtures (`test/fixtures/`)

```typescript
import {
  mockWorldSnapshot,
  mockPullRequestOverlay,
  mockSessionStartedEvent,
  mockToolStartedEvent,
  mockPromptCommand,
  mockPermitResolveAllowCommand,
} from './test/fixtures/index.js';
```

- **`world.fixture.ts`**: Sample `WorldSnapshot`, `District`, `Building`, `Road` definitions.
- **`diff.fixture.ts`**: Sample `PullRequestOverlay`, `FileDiffEntry`, git `--numstat` and `--name-status` raw text.
- **`events.fixture.ts`**: Standard `GameEvent` and `ServerMessage` objects.
- **`commands.fixture.ts`**: Pre-built `MayorCommand` objects for all actions.

### 6.2. Test WebSocket Client Helper (`test/helpers/ws-client.ts`)

`TestWebSocketClient` provides a typed, promise-based client for testing WebSocket servers:

```typescript
import { TestWebSocketClient } from './test/helpers/ws-client.js';

const client = new TestWebSocketClient('ws://127.0.0.1:4100/ws');
await client.connect();

// Wait for specific server message types:
const roster = await client.waitForMessageType('cities.roster');

// Send typed Mayor commands:
client.send({
  type: 'session.prompt',
  cityId: 'main',
  prompt: 'Refactor auth',
  model: 'sonnet',
  effort: 'high',
  permissionMode: 'default',
  contextPaths: [],
});

await client.close();
```

### 6.3. Mock Claude Agent SDK Harness (`test/helpers/mock-agent.ts`)

`MockAgentEngine` simulates Anthropic Claude Agent SDK execution loops without making live API calls:

```typescript
import { MockAgentEngine } from './test/helpers/mock-agent.js';

const engine = new MockAgentEngine();

const result = await engine.runSession({
  cityId: 'main',
  prompt: 'Add health check endpoint',
  onEvent: (event) => {
    console.log('Received event:', event.type);
  },
  onPermitRequest: async (permitId, toolName) => {
    return 'allow'; // or 'deny'
  },
});
```

### 6.4. Ephemeral Test Server Helper (`test/helpers/test-server.ts`)

`createTestServer` spins up a live Fastify server on an OS-assigned free port (port 0):

```typescript
import { createTestServer } from './test/helpers/test-server.js';

const testServer = await createTestServer();
console.log(testServer.httpUrl); // e.g. http://127.0.0.1:54321
console.log(testServer.wsUrl); // e.g. ws://127.0.0.1:54321/ws

await testServer.close();
```

### 6.5. Temporary Filesystem Utility (`test/helpers/temp-repo.ts`)

`createTempDirectory` creates isolated temp directories for scanner and git tests:

```typescript
import { createTempDirectory } from './test/helpers/temp-repo.js';

const temp = await createTempDirectory('visoagent-test-');
const filePath = await temp.createFile('src/main.ts', 'export const x = 1;');
// ... test operations ...
await temp.cleanup();
```

---

## 7. Code Quality & Formatting

### 7.1. Type Checking

Validate TypeScript types across all monorepo packages:

```bash
pnpm typecheck
```

### 7.2. ESLint Linting

Lint all source files using ESLint 9 Flat Config (`eslint.config.js`):

```bash
pnpm lint
pnpm lint:fix
```

### 7.3. Prettier Formatting

Format codebase according to `.prettierrc`:

```bash
pnpm format
pnpm format:check
```

---

## 8. Continuous Integration (CI)

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:

1. **Checkout & Cache**: Sets up Node 22 and pnpm with dependency caching.
2. **Format Check**: `pnpm run format:check`
3. **Lint**: `pnpm run lint`
4. **Typecheck**: `pnpm run typecheck`
5. **Test**: `pnpm run test:coverage` (Unit + Integration tests)
6. **Build**: `pnpm run build`

### Local CI Pre-Flight Check

To run the exact checks executed by CI before opening a pull request:

```bash
pnpm ci
```

---

## 9. Troubleshooting & FAQ

### Port Conflict (`EADDRINUSE`)

If port `4100` is already in use, set `PORT` in your `.env` file or CLI:

```bash
PORT=4200 pnpm dev:server
```

### TypeScript Reference Resolution

If package imports are not resolving during development, recompile package declarations:

```bash
pnpm build
```

### Resetting Cache & Workspaces

To clear build artifacts and caches:

```bash
pnpm clean
```
