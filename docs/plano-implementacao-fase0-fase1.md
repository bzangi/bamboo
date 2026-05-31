# Plano Sequencial de Implementação — Fase 0 + Fase 1

> **⚠️ Fonte viva migrou para o Spec Kit.** A alça do paciente (T0–T8) agora vive em **`specs/001-alca-do-paciente/`** — `spec.md` (QUE/PORQUÊ) → `plan.md` (COMO) → `tasks.md` (T003–T026, com o mapeamento T0–T8). **Trabalhe a partir de `specs/001-alca-do-paciente/tasks.md`.** Este documento passa a ser **histórico/contexto** (o "porquê" original das tasks). T0 e T1 já estão concluídos (Bloco 1).

> Specs atomizadas pra mandar ao **Claude Code**, uma por vez, na ordem.
> Escopo: fundação + alça do paciente (consultar "o agora" + substituir com recálculo).
> Fases 2+ ficam pra próxima leva.
> Deriva de [[plano-de-build]] · produto em [[decisoes-produto]] · modelo em [[schema.ts]].

## Como usar
- Mande **uma tarefa por vez** pro Claude Code, na sequência (respeite "Depende de").
- Cada tarefa é auto-contida: objetivo, dependências, entregáveis, spec e critérios de aceite.

## Convenções (assunções — ajuste se quiser)
- Monorepo: **pnpm workspaces + Turborepo** · Node 20+ · TypeScript strict
- Backend: **NestJS** · ORM: **Drizzle** + drizzle-kit · DB: **Postgres no Docker**
- Mobile: **Expo (React Native)** · Testes: **Vitest**
- Versões: usar as estáveis atuais (o Claude Code resolve; não chumbar números).

---

## T0 — Scaffold do monorepo
- **Objetivo:** monorepo vazio porém cabeado, que builda.
- **Depende de:** —
- **Entregáveis:** `apps/api` (NestJS), `apps/mobile` (Expo), `packages/{db,core,types,api-client}`, `turbo.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `package.json` raiz.
- **Spec:** usar `create-turbo`; `nest new apps/api`; `create-expo-app apps/mobile`; `packages/*` como libs TS estendendo o `tsconfig.base`. Aliases de import sob o scope **`@bamboo/*`** (`@bamboo/core`, `@bamboo/db`, `@bamboo/types`, `@bamboo/api-client`).
- **Aceite:** `pnpm install` ok; `turbo build` passa com os pacotes vazios; cada app sobe em dev.

## T1 — Postgres no Docker
- **Objetivo:** banco containerizado + variáveis de ambiente.
- **Depende de:** —
- **Entregáveis:** `docker-compose.yml` (serviço `postgres` com volume nomeado, porta 5432, `POSTGRES_USER/PASSWORD/DB`), `.env.example` com `DATABASE_URL`.
- **Spec:** volume pra persistência; healthcheck no serviço; documentar `docker compose up -d` no README.
- **Aceite:** `docker compose up -d` sobe o Postgres; conexão via `DATABASE_URL` funciona.

## T2 — Drizzle + schema + migrations
- **Objetivo:** schema versionado aplicado no banco.
- **Depende de:** T0, T1
- **Entregáveis:** `packages/db` com `schema.ts` (já existente), `drizzle.config.ts`, client (`export const db`), scripts `db:generate` / `db:migrate`.
- **Spec:** instalar `drizzle-orm`, `drizzle-kit`, `pg`; apontar config pro `DATABASE_URL`; gerar e aplicar a migration inicial.
- **Aceite:** migration gerada e aplicada; tabelas existem (inspecionar via `drizzle-kit studio` ou `psql`); `db` importável pelos outros pacotes.

## T3 — Ingestão da TACO
- **Objetivo:** popular `food` + `food_household_measure`.
- **Depende de:** T2
- **Entregáveis:** `packages/db/scripts/ingest-taco.ts`; arquivo de dados em `data/taco.(json|csv)`.
- **Spec:** mapear colunas da TACO → campos de `food` (kcal/carb/protein/fat/fiber por 100g) e medidas caseiras → `food_household_measure`. **Sourcing:** o Claude Code pode buscar uma conversão JSON/CSV pública da TACO (ex.: repositórios no GitHub) ou usar um arquivo fornecido; deixar o caminho configurável por env.
- **Aceite:** rodar o script popula `food` (contagem > 0) com medidas caseiras; spot-check de 3–4 alimentos confere com a tabela.

## T4 — `packages/core`: motor de substituição (TS puro + testes) — **o coração**
- **Objetivo:** função pura de substituição 1-pra-1 com recálculo de quantidade.
- **Depende de:** T0
- **Entregáveis:** `packages/core/src/substitution.ts` + `substitution.test.ts` (Vitest).
- **Spec da função** (sem DB/HTTP — recebe tudo por argumento; **retorna `Result<…, SubstitutionError>`, nunca lança nem retorna `null`** — ver CLAUDE.md › Arquitetura e paradigma funcional):
  - Input: item atual (food origem com macros/100g, quantidade em g, grupo com `basis`) + food-alvo (mesmo grupo, macros/100g + medidas caseiras).
  - Lógica:
    1. nutriente-base do item: `nutBase = (origem.basisPer100g / 100) * gramasItem`
    2. nova quantidade do alvo preservando o nutriente: `gramasAlvo = nutBase / (alvo.basisPer100g / 100)`
    3. arredondar pra medida caseira mais próxima do alvo; retornar gramas **e** o rótulo da medida.
  - Guardas (como `err`, não `throw`): alvo com 0 do nutriente-base → `err({ kind: 'nutriente-base-zero' })`; alvo fora do grupo → `err({ kind: 'fora-do-grupo' })`.
- **Aceite:** testes cobrindo troca normal (`ok`), arredondamento pra medida caseira, alvo com 0 do nutriente (retorna `err`, não lança) e preservação do nutriente-base dentro de tolerância.

## T5 — API: plano do dia + opções de substituição (NestJS)
- **Objetivo:** a API que alimenta o app do paciente.
- **Depende de:** T2, T4
- **Entregáveis:** módulos NestJS (`plan`, `substitution`); DTOs em `packages/types`.
- **Endpoints:**
  - `GET /patients/:id/today` → resolve o tipo-de-dia pelo weekday (via `day_schedule`); retorna refeições → opções → itens com nutrição calculada + o rótulo do tipo-de-dia.
  - `GET /meal-items/:id/substitutions` → lista os foods do grupo do item com a quantidade equivalente já calculada (usa `packages/core`).
- **Nota:** aplicar a troca é client-side no v0 (persistência = logs, deferido).
- **Aceite:** `/today` retorna o plano semeado; `/substitutions` retorna alternativas com quantidades corretas (batendo com os testes do core).

## T6 — Seed
- **Objetivo:** dados realistas pra consultar.
- **Depende de:** T2, T3
- **Entregáveis:** `packages/db/scripts/seed.ts`.
- **Spec:** criar 1 nutri, 1 paciente; grupos `Carboidratos`(basis=carb) e `Proteínas`(basis=protein); associar alguns foods da TACO aos grupos com `reference_portion_grams`; 1 plano com tipos-de-dia (treino, descanso), `day_schedule` da semana, refeições, `meal_option` (inclusive um almoço com 2–3 opções), `meal_item` com mix de travado/flexível.
- **Aceite:** rodar o seed e a API `/today` devolver esse plano; existe ≥ 1 item flexível com substitutos.

## T7 — Expo: home "o agora" + ver plano
- **Objetivo:** paciente vê a refeição do momento no device.
- **Depende de:** T5
- **Entregáveis:** tela Home em `apps/mobile`; `packages/api-client` com chamadas tipadas.
- **Spec:** auth stub (paciente fixo via env no v0); buscar `/today`; mostrar o tipo-de-dia **anunciado** no topo ("Hoje: dia de treino") + a refeição atual/próxima; lista das refeições do dia.
- **Aceite:** rodar no Expo (device/emulador) e ver o plano semeado, com o rótulo do dia.

## T8 — Expo: substituição (a alça que prova a tese)
- **Objetivo:** trocar um alimento com a conta feita.
- **Depende de:** T7
- **Entregáveis:** tela/bottom-sheet de substituição.
- **Spec:** tocar num item flexível → buscar `/substitutions` → mostrar alternativas com quantidade recalculada + medida caseira → selecionar → atualizar a refeição na tela (estado local). Item travado não oferece troca.
- **Aceite:** no device, trocar arroz por batata (ou similar) e ver a quantidade equivalente correta + medida caseira; item travado não abre opção.

---

## Deferido (próxima leva)
Combinação (arroz+batata juntos) · rebalanceamento multi-refeição · override de tipo-de-dia + `day_selection` · logs (feito/troquei/pulei) · adesão/relatório · UI da nutri · import por IA · offline · auth de verdade · notificações.
