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

`pnpm dev` (na raiz) builda os packages `@bamboo/*` e sobe **API + web** juntos via Turborepo:

```sh
pnpm dev
# API (NestJS)  → http://localhost:3333   (Swagger UI em /docs)
# web (Next.js) → http://localhost:3000
```

Ou individualmente:

```sh
pnpm --filter api dev       # NestJS  → http://localhost:3333 (carrega o .env da raiz)
pnpm --filter web dev       # Next.js → http://localhost:3000
pnpm --filter mobile start  # Expo (Metro) — roda separado
```

> Pré-requisito: Postgres no ar (`docker compose up -d`) + banco migrado/semeado. A API lê a `DATABASE_URL` do `.env` da raiz automaticamente.

## Documentação da API (OpenAPI / Swagger)

Com a API rodando:

- **Swagger UI:** `http://localhost:<porta>/docs`
- **Spec JSON:** `http://localhost:<porta>/docs-json`

**Importar no Postman:** Import → cole a URL `http://localhost:<porta>/docs-json` (ou o arquivo `apps/api/openapi.json`) → o Postman gera a collection com os endpoints, params e schemas.

O spec também fica versionado em **`apps/api/openapi.json`** (não precisa subir o server pra importar). Para regerá-lo após mudar endpoints/DTOs:

```sh
pnpm build                    # garante os packages @bamboo/* buildados
pnpm --filter api run openapi:gen   # gera apps/api/openapi.json
```

> Os UUIDs de `patientId` / `mealItemId` mudam a cada `seed` — pegue os atuais no log do seed ou no banco (`select id from patient limit 1`).
