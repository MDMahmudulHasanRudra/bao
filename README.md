# Business AI OS

AI-native multi-tenant business operating system for small and mid-sized businesses.

**Delivery status (2026-09-23):** backlog slices P0-1…P2-3 complete — see `../AGENTS.md` then `../business-ai-os-blueprint/state/CURRENT_STATUS.md` (read the START HERE block first). Tests **160/160**.

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Hono (TypeScript) modular monolith — API `:5000`
- **Database:** PostgreSQL 16 + pgvector
- **Queue:** Redis + BullMQ
- **Object Storage:** S3-compatible (MinIO for local dev)
- **Containerization:** Docker + Docker Compose (user rebuilds; agents do not run Docker)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
pnpm docker:up

# Copy environment variables
cp .env.example .env

# Seed database
pnpm db:seed

# Start development servers
pnpm dev
```

Local stack: API `http://localhost:5000`, web `http://localhost:3000`. Demo login: `demo` / `demo1234` (dev only). Login is username-based; email is not an auth identifier.

**pnpm note:** if `pnpm <script>` is blocked (prisma approve-builds), run tools directly, e.g. `node node_modules/typescript/bin/tsc --build`, `node node_modules/vitest/vitest.mjs run` from repo root.

### Health Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes database and Redis)

## Project Structure

```
business-ai-os/
├── apps/
│   ├── web/          # Next.js frontend
│   ├── api/          # Hono API server
│   └── worker/       # Background job processor
├── packages/
│   ├── contracts/    # Shared TypeScript types
│   ├── ui/           # Shared UI components
│   └── config/       # Shared configuration
├── infra/
│   └── docker/       # Docker configurations
└── tests/
    ├── e2e/          # End-to-end tests
    └── integration/  # Integration tests
```

## Modules

1. **Identity & Access** - User management, organizations, RBAC
2. **Knowledge Hub** - Document upload, RAG, semantic search
3. **AI Assistant** - Chat with company knowledge
4. **Sales** - CRM, pipeline, leads, activities
5. **Proposals** - Template-based proposal generation
6. **Presentations** - AI-powered presentation creation
7. **Intelligence** - Web monitoring and competitive intelligence
8. **Dashboard** - Overview and quick actions
9. **Analytics** - Business intelligence
10. **Notifications** - Alerts and notifications

## API Documentation

API endpoints follow REST conventions with versioning (`/api/v1/`).

### Authentication

All protected routes require a Bearer token in the Authorization header.

### Tenant Isolation

Every request must include `x-organization-id` header to establish tenant context.

## Docker Production

```bash
# Build and start all services
docker compose -f infra/docker/docker-compose.prod.yml up -d

# View logs
docker compose -f infra/docker/docker-compose.prod.yml logs -f

# Stop services
docker compose -f infra/docker/docker-compose.prod.yml down
```

## License

Proprietary - All rights reserved.
