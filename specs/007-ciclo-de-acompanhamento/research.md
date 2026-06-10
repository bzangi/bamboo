# Research — 007-ciclo-de-acompanhamento

> Fase 0 do plan. Decisões D1–D8 (Decision / Rationale / Alternatives). Insumos: spec fechada (Sessão 2026-06-10), schema real (`packages/db/src/schema.ts`), via `/nutri` da 006, `local-date.ts`.

## D1 — Modelo: `cycle` + `cycle_plan_vigencia` (migration 0003)

**Decision**: duas tabelas novas. `cycle`: `id`, `patient_id` (FK, not null), `started_on` (date), `expected_duration_days` (integer, not null — obrigatória), `closed_on` (date, null = ativo), `created_at`. `cycle_plan_vigencia`: `id`, `cycle_id` (FK), `plan_id` (FK), `valid_from` (date), `valid_to` (date, null = corrente). Índice único **parcial** em `cycle(patient_id) WHERE closed_on IS NULL`.

**Rationale**: o ciclo é janela em dia-calendário (mesma granularidade do registro — `logged_date`); a vigência 1:N por períodos é exatamente a decisão Q2-A. O índice parcial faz o banco garantir FR-002 (1 ativo/paciente) sem lock manual.

**Alternatives considered**: `plan.cycle_id` (rejeitado: inverte a relação e força 1:1 — contraria Q2-A); versão de plano por cópia (rejeitado no gate — opção B); guardar duração como data-limite (rejeitado: prazo não fecha sozinho, é previsão — guardar o insumo, não a conclusão).

## D2 — "Observa" na prática: ativação de plano vira ato explícito da casca

**Decision**: `POST /nutri/patients/:id/active-plan {planId}` — num `db.transaction`: desativa o plano ativo atual, ativa o novo e, **se houver ciclo aberto**, fecha a vigência corrente (`valid_to = hoje`) e abre a nova (`valid_from = hoje`). Abrir um ciclo grava a **vigência inicial** = plano ativo no ato. Sem ciclo aberto, a troca acontece sem registro de vigência (nada a observar — histórico fora de ciclo, Q3-B).

**Rationale**: a decisão do dono ("observa") mantém o plano ativo como única fonte do presente; pra linha do tempo existir, o ATO da troca precisa registrar — e hoje a troca só existe dentro do seed (não há endpoint). Expor o ato na via da nutri é o menor mecanismo observável e testável; o seed continua livre pra montar cenários (e o e2e usa a operação real).

**Alternatives considered**: derivar vigência de `meal_event.plan_id` (rejeitado: dias sem registro não respondem "qual plano vigia"; vira inferência, não registro); trigger SQL no flip de `is_active` (rejeitado: regra de negócio invisível, fora do padrão núcleo/casca); exigir que o seed grave vigência (rejeitado: espalha a regra; seed pode usar a operação).

## D3 — Atribuição (dia → ciclo) é função pura no core

**Decision**: `atribuirCiclo(ciclos, dia)` em `packages/core/src/ciclo.ts`: um ciclo **cobre** `dia` quando `started_on ≤ dia` e (`closed_on` é null **ou** `dia ≤ closed_on`); havendo mais de um cobrindo (fronteira fechou-e-reabriu no mesmo dia), vence o de `started_on` mais recente — e, em empate de `started_on`, o de criação mais recente. Datas como strings `YYYY-MM-DD` (ordem lexicográfica = cronológica).

**Rationale**: é a regra-fundação que adesão/relatório vão consumir (FR-009: determinística, uma resposta) — exatamente o tipo de regra que pertence ao núcleo puro e testável sem banco. O desempate implementa a assumption da spec.

**Alternatives considered**: resolver por SQL (rejeitado: a regra de fronteira ficaria no WHERE, fora do núcleo e dos testes puros); janela fechada exclusiva no fim (rejeitado: um ciclo fechado manualmente sem sucessor deixaria o próprio dia do fechamento órfão — inclusivo + desempate cobre os dois casos).

## D4 — Ciclo de vida (A+C) na casca, decidido no core

**Decision**: `decidirAbertura({ativo, hoje, duracaoDias})` → `err duracao-invalida` (≤ 0 ou não-inteira) | `ok {fecharAnteriorEm: hoje} + abrir`; `decidirFechamento({ativo})` → `ok no-op-orientado` quando não há ativo (nunca erro destrutivo). O service executa: abrir = (fechar anterior se houver, `closed_on = hoje`) + insert ciclo + vigência inicial, **numa transação**; fechar manual = `closed_on = hoje`. Prazo vencido não dispara nada (não há job/cron).

**Rationale**: implementa o híbrido A+C do gate com a distinção fechar≠reavaliar preservada (fechar manual existe; abrir fecha o anterior como conveniência). "Nunca barra, orienta" replicado no fechar-sem-ativo.

**Alternatives considered**: rejeitar abertura com ciclo ativo (era o draft pré-gate — substituído pela decisão C); job de fechamento por prazo (rejeitado no gate — opção B).

## D5 — Duração: aceitar e armazenar DIAS

**Decision**: `expectedDurationDays` (inteiro > 0) no contrato e na tabela. "Semanas" é apresentação — a UI futura converte; a API aceita só dias.

**Rationale**: um campo, uma unidade, zero ambiguidade; a spec pede "expressa em dias/semanas" como capacidade de expressão da nutri, não dois formatos persistidos.

**Alternatives considered**: `{value, unit}` (rejeitado: complexidade sem consumidor; YAGNI).

## D6 — FR-010 (janela + registros do período) no detalhe do ciclo

**Decision**: `GET /nutri/patients/:id/cycles/:cycleId` devolve a janela, a linha de vigências e os **registros do período** como resumo por evento vigente: `(date, mealId, position, state)` — resolvido com `estadoVigente` (core) sobre os `meal_event` da janela, sem macros/consumo (quem calcula é a adesão/relatório).

**Rationale**: FR-010 pede o conjunto exato de registros, não métricas; resolver o estado vigente é a leitura canônica da Fase 3 (anulações não aparecem como registro). Consumo/valores ficam com a 006 (mesma janela).

**Alternatives considered**: devolver eventos crus append-only (rejeitado: exporia anulações/correções como se fossem registros — quem consome teria que reimplementar estado vigente); devolver a série de adesão junto (rejeitado: mistura features; o relatório futuro compõe os dois).

## D7 — Guard compartilhado: extração para `apps/api/src/nutri/`

**Decision**: mover `nutri-key.guard.ts` de `adesao/` para `nutri/` e atualizar o import da 006. Comportamento idêntico (mesma env, mesmo fail-closed); e2e da 006 segue passando sem mudança.

**Rationale**: o guard protege a VIA `/nutri`, não a feature adesão; 007 é o segundo consumidor.

**Alternatives considered**: duplicar (rejeitado: duas cópias da mesma regra de acesso); importar de `adesao/` (rejeitado: acoplamento entre features irmãs).

## D8 — Datas do ciclo: `localToday()` como única fonte de "hoje"

**Decision**: `started_on`/`closed_on`/`valid_from`/`valid_to` derivam de `localToday()` (mesma função do registro). Abrir/fechar não aceitam data arbitrária no v0 (o ato É o marco — "consulta é marco de data"); o e2e monta cenários históricos por insert direto (mesmo padrão da 006).

**Rationale**: assumption da spec — ciclo e registro precisam da MESMA fonte de dia, senão a atribuição quebra na virada da meia-noite; aceitar data retroativa na API reabriria a discussão de retroatividade que o gate fechou (Q3-B: não inventa marco).

**Alternatives considered**: aceitar `startedOn` no payload (rejeitado: convida ciclo retroativo — decisão C do gate descartou); timestamps completos (rejeitado: janela é por dia-calendário, granularidade do registro).
