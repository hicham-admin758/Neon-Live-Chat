# Overview

A live interactive gaming platform with Arabic RTL interface, enabling real-time multiplayer experiences through YouTube chat integration. Players join games by typing commands in YouTube live chat, and their avatars appear in a live game circle on the platform. The system uses WebSocket connections for real-time updates and PostgreSQL for persistent storage.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **UI Components**: shadcn/ui component library (Radix UI primitives)
- **Real-time**: Socket.IO client for WebSocket connections
- **Build Tool**: Vite with HMR support

The frontend follows a component-based architecture with pages in `client/src/pages/` and reusable components in `client/src/components/`. Custom hooks in `client/src/hooks/` handle data fetching and real-time subscriptions.

## Backend Architecture
- **Framework**: Express.js 5 with TypeScript
- **Real-time**: Socket.IO server for broadcasting player updates
- **API Design**: REST endpoints defined in `shared/routes.ts` with Zod validation
- **Database ORM**: Drizzle ORM with PostgreSQL dialect

The server uses a storage abstraction pattern (`server/storage.ts`) for database operations, making it easy to swap implementations. Routes are registered in `server/routes.ts` and emit WebSocket events when data changes.

## Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts`: Drizzle table definitions and Zod schemas
- `routes.ts`: API endpoint definitions with input/output types

## Database Schema
Currently minimal with a `users` table:
- `id`: Serial primary key
- `username`: Player display name
- `avatarUrl`: Optional profile image
- `joinedAt`: Timestamp of when player joined

## Real-time Communication
Socket.IO handles bidirectional communication:
- Server emits `new_player` events when users are created
- Clients automatically invalidate React Query cache on events
- Connection status displayed in UI header

# External Dependencies

## Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle Kit**: Schema migrations with `npm run db:push`

## Third-party Services
- **Socket.IO**: WebSocket library for real-time features
- **YouTube Live Chat**: Players join by typing `!دخول` in chat (integration point for future development)

## Key NPM Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM with Zod schema generation
- `@tanstack/react-query`: Async state management
- `socket.io` / `socket.io-client`: Real-time communication
- `zod`: Runtime type validation
- `express-session` / `connect-pg-simple`: Session management (available but not yet implemented)

## Replit-specific
- `@replit/vite-plugin-runtime-error-modal`: Error overlay in development
- `@replit/vite-plugin-cartographer`: Development tooling