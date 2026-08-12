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
└── docs/                        # Architecture & reference documentation
```

For complete technical specifications, see [docs/architecture.md](file:///Users/adithya/.ao/data/worktrees/claude-city/claude-city-4/docs/architecture.md) and [docs/reference-architecture.md](file:///Users/adithya/.ao/data/worktrees/claude-city/claude-city-4/docs/reference-architecture.md).

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

## 🛠 Development Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Starts server and web development servers in parallel |
| `pnpm dev:server` | Starts Fastify backend with live reload (`tsx watch`) |
| `pnpm dev:web` | Starts Vite React frontend development server |
| `pnpm build` | Compiles all packages and builds applications for production |
| `pnpm test` | Runs test suites across all workspaces with Vitest |
| `pnpm test:watch` | Runs Vitest in interactive watch mode |
| `pnpm typecheck` | Runs TypeScript type checking across all workspaces |
| `pnpm clean` | Removes build outputs and caches across packages |

---

## 🧪 Testing

Run the test suite across protocol schemas, backend health endpoints, and frontend shell:
```bash
pnpm test
```

---

## 🗺 API & Protocol Endpoints

- `GET /health`: Server health check probe returning `{ status: "ok", version: "0.1.0", timestamp: "...", repoPath: "..." }`.
- `WS /ws`: WebSocket stream for Mayor commands and server events.
