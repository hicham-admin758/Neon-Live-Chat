# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Project: خلية البطولات (Tournament Cell)

An Arabic tournament management and bracket display platform.

### Features
- **Public Interface**: Homepage shows active bracket, news ticker. Archive page shows completed tournaments. News page.
- **Admin Panel** (`/admin`): Protected with password `112233`. Full tournament management.
- **Real-time updates**: Polling every 3 seconds for live score updates.
- **Bracket System**: Auto-generates single elimination brackets from participants.

### DB Schema (lib/db/src/schema/)
- `tournamentsTable` — tournaments with name, type, status, winner
- `participantsTable` — participants per tournament
- `matchesTable` — matches with round, scores, winner
- `newsTable` — news articles

### API Routes (artifacts/api-server/src/routes/)
- `tournaments.ts` — full CRUD + generate-bracket + archive endpoints
- `news.ts` — full CRUD for news articles
