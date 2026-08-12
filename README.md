# VisoAgent: Spatial AI Coding Agent City

VisoAgent (Claude City) transforms software repositories into an interactive, spatial 2.5D isometric pixel-art city where developers act as the **Mayor** of their codebase, supervising and dispatching autonomous AI coding agent construction crews.

---

## 🏛 Architecture & Monorepo Topology

The project is organized as a clean `pnpm` monorepo enforcing strict boundaries across packages and applications:

```
├── apps/
│   ├── web/                     # Frontend Client (React 19 + Phaser 3 + Vite)
│   └── server/                  # Backend Application (Fastify 5 + WebSockets)
├── packages/
│   ├── protocol/                # Shared Zod schemas, TypeScript types, and event definitions
│   ├── worldgen/                # Repository scanner and metrics analyzer
│   ├── layout/                  # Deterministic Squarified Block Treemap layout engine
│   ├── storage/                 # Embedded SQLite persistence layer (.visocity/world.db)
│   ├── git/                     # Git worktree manager & GitHub API/CLI client
│   └── agent/                   # Autonomous Claude Agent SDK wrapper
├── test/
│   ├── fixtures/                # Shared test fixtures & protocol mocks
│   ├── helpers/                 # Test WebSocket client, mock agent harness, test server
│   └── integration/             # Multi-module and protocol integration tests
└── docs/                        # Architecture & development documentation
```

For complete technical specifications, see:

- [docs/architecture.md](docs/architecture.md)
- [docs/reference-architecture.md](docs/reference-architecture.md)
- [docs/development.md](docs/development.md)

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `>= 22.0.0` (Recommended: Node 22.x or 24.x)
- **pnpm**: `>= 10.x` (`corepack enable` or `npm install -g pnpm`)

### 1. Installation

Install all monorepo dependencies:

```bash
pnpm install
```

### 2. Environment Configuration

Copy the sample environment file:

```bash
cp .env.example .env
```

Key environment variables:

- `HOST`: Server interface binding (default: `127.0.0.1`)
- `PORT`: Server port (default: `4100`)
- `WEB_ORIGIN`: Allowed client CORS origin (default: `http://127.0.0.1:5173`)
- `SUDO_CITY_REPO`: Target repository root path (default: current working directory `.`)
- `SUDO_CITY_MAX_BUDGET_USD`: Spend ceiling in USD (default: `1.00`)

### 3. Starting the Application

#### Run Full Stack (Frontend + Backend concurrently):

```bash
pnpm dev
```

#### Run Backend Server only:

```bash
pnpm dev:server
```

The Fastify server starts at `http://127.0.0.1:4100`.
Health endpoint is available at `http://127.0.0.1:4100/health`.

#### Run Frontend Client only:

```bash
pnpm dev:web
```

The Vite development server starts at `http://127.0.0.1:5173`.

---

## 🛠 Development & Testing Scripts

| Command                 | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`              | Starts server and web development servers in parallel                        |
| `pnpm dev:server`       | Starts Fastify backend with live reload (`tsx watch`)                        |
| `pnpm dev:web`          | Starts Vite React frontend development server                                |
| `pnpm build`            | Compiles all packages and builds applications for production                 |
| `pnpm test`             | Runs the complete test suite (unit + integration) with Vitest                |
| `pnpm test:unit`        | Runs all unit test suites across packages and apps                           |
| `pnpm test:integration` | Runs subsystem, WebSocket, and HTTP integration tests                        |
| `pnpm test:coverage`    | Runs test suites and produces v8 code coverage reports                       |
| `pnpm test:watch`       | Runs Vitest in interactive watch mode                                        |
| `pnpm typecheck`        | Runs TypeScript type checking across all workspaces                          |
| `pnpm lint`             | Runs ESLint 9 across all packages and apps                                   |
| `pnpm lint:fix`         | Runs ESLint and automatically fixes fixable issues                           |
| `pnpm format`           | Formats all files across the repository using Prettier                       |
| `pnpm format:check`     | Verifies code formatting without making changes                              |
| `pnpm ci`               | Runs the complete CI pipeline locally (format, lint, typecheck, test, build) |
| `pnpm clean`            | Removes build outputs and caches across packages                             |

---

## 🧪 Testing

Run the full test suite across protocol schemas, backend health endpoints, WebSocket streams, and frontend components:

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run tests with code coverage
pnpm test:coverage
```

For detailed guides on writing tests, using mock harnesses (`MockAgentEngine`), test clients (`TestWebSocketClient`), and shared fixtures, see [docs/development.md](docs/development.md).

---

## 🗺 API & Protocol Endpoints

- `GET /health`: Server health check probe returning `{ status: "ok", version: "0.1.0", timestamp: "...", repoPath: "..." }`.
- `WS /ws`: WebSocket stream for Mayor commands and server events.
