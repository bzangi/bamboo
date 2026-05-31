# Bamboo

SaaS para nutricionistas. Monorepo **pnpm + Turborepo**, Node 20+, TypeScript strict.

B2B2C: a nutri paga o SaaS, o paciente usa de graça. App mobile (Expo) para o paciente, web (Next.js) para a nutri, API (NestJS) + Postgres/Drizzle. A lógica de domínio (substituição, rebalanceamento, cálculo nutricional) vive em `packages/core` — TS puro, sem I/O.

> Contexto de produto e arquitetura em `docs/` e `CLAUDE.md`. Constituição em `.specify/memory/constitution.md`.

## Estrutura

```
apps/
  api/         # NestJS
  web/         # Next.js (web da nutri)
  mobile/      # Expo (app do paciente)
packages/
  core/        # domínio puro: substituição, rebalanceamento, cálculo
  db/          # Drizzle: schema + migrations + client
  types/       # contratos/DTOs compartilhados
  api-client/  # client tipado da API
  typescript-config/  # tsconfig base compartilhado
  eslint-config/      # config de lint compartilhada
```

Imports internos sob o scope `@bamboo/*` (ex.: `@bamboo/core`).

## Pré-requisitos

- Node 20+ (recomendado via `corepack`)
- pnpm (gerenciado por `corepack` — ver `packageManager` no `package.json`)
- Docker + Docker Compose (para o Postgres)

## Setup

```sh
corepack enable
pnpm install
pnpm build        # turbo build de todos os pacotes/apps
```

## Banco de dados (Postgres no Docker)

```sh
cp .env.example .env     # ajuste credenciais se quiser
docker compose up -d     # sobe o Postgres
docker compose ps        # confirma o serviço healthy
docker compose down      # derruba (mantém o volume)
```

A `DATABASE_URL` fica no `.env` (ver `.env.example`).

## Rodar os apps em dev

```sh
pnpm --filter api dev       # NestJS (http://localhost:3000)
pnpm --filter web dev       # Next.js da nutri (http://localhost:3000)
pnpm --filter mobile start  # Expo (app do paciente)
```
