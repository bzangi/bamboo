# Research — 006-metrica-adesao

> Fase 0 do plan. Decisões D1–D8, cada uma com Decision / Rationale / Alternatives.
> Insumos: spec resolvida (Sessão 2026-06-10), código real (`packages/core`, `apps/api`, `packages/db/src/schema.ts`), specs 002/003/004.

## D1 — A fórmula vive num módulo novo do core, reusando a matemática da Fase 2

**Decision**: `packages/core/src/adesao.ts` com duas funções puras:

- `adesaoDoDia({ alvo, consumido, toleranciaPct, refeicoesDoTipo, refeicoesRegistradas })` → `{ valorPct, dentroFaixa, flags, cobertura }`
- `mediaAdesao(valores: readonly number[])` → `number | null` (vazio → `null`)

O valor é **kcal saturado na faixa** (Q1a-B/Q1b-iii): `avaliarFaixa(consumido, alvo, toleranciaPct).kcal === 'dentro'` → 100; senão, desvio relativo a partir da **borda mais próxima** (`borda = alvo.kcal ± margem`), `valorPct = max(0, 100 − 100×|consumido.kcal − borda|/alvo.kcal)`. Flags por macro = `avaliarFaixa(...)` nos campos `carb/protein/fat ≠ 'dentro'`.

**Rationale**: `avaliarFaixa` (nutrition.ts) já implementa a semântica de faixa por nutriente da Fase 2 — borda inclusiva ("≤ margem é dentro"), simetria, alvo 0 → margem 0. Reusá-la garante que a adesão e o motor **concordam** sobre o que é "dentro da faixa" (mesma régua). A classificação do FR-006a e os flags do FR-008 são o próprio retorno de `avaliarFaixa` — zero matemática nova além do desvio saturado.

**Alternatives considered**: re-implementar a checagem de faixa dentro de `adesao.ts` (rejeitado: duas réguas que podem divergir); pôr a fórmula na casca (rejeitado: viola Princípio III; a fórmula é regra de negócio testável sem banco).

## D2 — Edge da fórmula: alvo de kcal = 0

**Decision**: `alvo.kcal === 0` e `consumido.kcal === 0` → dentro (100%); `alvo.kcal === 0` e `consumido.kcal > 0` → fora com `valorPct = 0` (sem divisão por zero — caso especial explícito).

**Rationale**: coerente com `avaliarFaixa` (alvo 0 → margem 0; total 0 → "dentro"). Desvio relativo é indefinido com alvo 0 — qualquer consumo é infinitamente fora; clamp em 0 é o único valor honesto.

**Alternatives considered**: tratar como "sem dado" (rejeitado: há dado — o paciente comeu; o plano é que é degenerado, caso de seed quebrado que o teste cobre).

## D3 — Tipo-de-dia que define o alvo (Q3-B): resolução na casca, em duas fontes

**Decision**: por data, na casca: (1) coletar os `day_type_id` **distintos** dos eventos com estado vigente do dia; (2) se houver exatamente 1 → é o tipo do alvo; (3) senão (sem registro, ou divergentes) → fallback no `day_schedule` do plano ativo pelo `weekday` da data. O tipo resolvido define: o conjunto de refeições do alvo (`meal.day_type_id`), o alvo (`alvoDoDia` das opções default) e o denominador da cobertura.

**Rationale**: `meal_event.day_type_id` é snapshot gravado no registro (003 FR-014) — Q3-B usa só dado que existe. O `day_schedule` (weekday → day_type) é a programação default da Fase 1/2, mesma fonte que o `/today` usa pro dia corrente.

**Alternatives considered**: usar o tipo da refeição registrada (`meal.day_type_id` via join) em vez do snapshot (rejeitado: um troquei registrado sob override carrega o tipo em vigor no snapshot — é exatamente o sinal que a Q3-B quer); resolver no core (rejeitado: exige I/O).

## D4 — Pareamento registro × refeição do tipo do alvo: por `position`

**Decision**: pra **cobertura** e **consumo**, um registro cujo `meal_id` pertence a OUTRO tipo-de-dia pareia com a refeição de **mesma `position`** do tipo que define o alvo (e conta uma vez só). Registro com `position` sem correspondente no tipo do alvo conta no consumido (o paciente comeu), mas não adiciona slot ao denominador da cobertura (denominador = refeições do tipo do alvo).

**Rationale**: precedente direto da Fase 4 (`getToday` pareia slots por position no recálculo da troca de tipo-de-dia — "evita double-count"). O edge case da spec delega exatamente este detalhe ao plan.

**Alternatives considered**: descartar registros de outro tipo (rejeitado: consumo real sumiria do dia — mentiria pra nutri); denominador = união dos tipos (rejeitado: infla o denominador num caso raro).

## D5 — Carga do consumo por período: loader batch novo, mesmo padrão da Fase 4

**Decision**: `apps/api/src/adesao/adesao-consumo.ts` — `carregarConsumoPorPeriodo(db, { patientId, planId, from, to })` → `Map<date, ConsumoDia>`. Quatro selects batch (mesma forma do `registro-consumo.ts`): eventos do range com join em `meal` (position) — agrupa por `(logged_date, meal_id)` e resolve `estadoVigente` (core); opções cumpridas dos `feito` (com fallback D9 da Fase 4: default → 1ª opção); `meal_item` das opções; `meal_event_item` dos `troquei` vigentes. Inclui `day_type_id` do evento vigente por refeição (insumo do D3).

**Rationale**: `registro-consumo.ts` é hardcoded em `localToday()` e atende os gatilhos do dia corrente; a série precisa de range sem N+1. O padrão (estado vigente + feito=opção cumprida / troquei=snapshot / pulei=[]) é reusado tal qual — a **regra** já mora no core (`estadoVigente`, `somaNutrientes`); o loader novo duplica só a forma da query.

**Alternatives considered**: parametrizar a data em `registro-consumo.ts` e iterar por dia (rejeitado: N+1 × 4 queries num período de 90 dias); refatorar `registro-consumo` pra range e fazer os callers atuais passarem `[hoje, hoje]` (rejeitado por escopo: mexeria em 2 services testados da Fase 4 sem ganho funcional — fica como simplificação futura, nomeada aqui).

## D6 — Via da nutri (FR-016): namespace `/nutri` + guard de credencial stub fail-closed

**Decision**: `GET /nutri/patients/:patientId/adesao?from&to` num módulo novo, protegido por `NutriKeyGuard`: exige header `x-nutri-key` idêntico a `process.env.NUTRI_API_KEY`; **env ausente/vazia → nega tudo** (fail-closed). `.env.example` ganha `NUTRI_API_KEY`. O mobile/`api-client` do paciente **não** conhecem a chave (nada é adicionado lá).

**Rationale**: FR-016 exige dois critérios verificáveis no v0: omissão total nos fluxos do paciente + via da nutri **negada** a requisições com identidade de paciente (SC-008). O guard dá um e2e direto: chamada sem header (como o app faria) → 403. É o stub honesto da "credencial da nutri" até a auth real (dependência declarada na spec). Limite v0 nomeado: a chave dá o papel "nutri do sistema" — não distingue nutri A/B; escopo por **nutri responsável** entra com a auth real.

**Alternatives considered**: endpoint aberto em path não documentado (rejeitado: segurança por obscuridade, viola Princípio V); consulta só por CLI/seed sem HTTP (rejeitado: SC-008 ficaria não-testável como "requisição negada" e o relatório/web futuros consumiriam a mesma via HTTP); auth real agora (rejeitado: transversal de outra feature, escopo gigante).

## D7 — "Sem dado": derivado, não sinalizado

**Decision**: um dia é **sem dado** quando não tem nenhuma refeição com estado vigente (cobertura zero — inclui datas anteriores ao primeiro registro), quando a data é futura (vs `localToday()`), ou quando o paciente não tem plano ativo na consulta (todos os dias sem dado). `valorPct/dentroFaixa/flags/cobertura` ausentes nesses dias; a média ignora-os (`mediaAdesao` recebe só os com-dado). Paciente inexistente → 404 (`NotFoundException`).

**Rationale**: Q2-B subsume o caso "anterior ao primeiro registro" sem lógica extra — cobertura zero já é sem dado. "Sem plano ativo é estado do paciente na consulta" (FR-012) → resposta inteira sem dado, nunca erro. 404 só pra recurso inexistente (padrão das fases anteriores).

**Alternatives considered**: 0% pra dia vazio (rejeitado pela spec: sem dado ≠ 0%, SC-006); erro pra período sem dado (rejeitado: FR-012/US3.2).

## D8 — Régua corrente na prática: eventos filtrados pelo plano ativo

**Decision**: a consulta usa o **plano ativo do paciente no momento** (`plan.isActive`) como régua E como filtro dos eventos (`meal_event.plan_id = plano ativo`), e `resolverParametros({ sistema, nutri, paciente })` pra tolerância. Consequência declarada: dias cujos registros pertencem só a um plano **antigo** ficam com cobertura zero → **sem dado** (não são lidos com régua de outro plano).

**Rationale**: é a Assumption "fonte do plano = o ativo corrente" aceita no gate, aplicada também ao filtro de eventos — ler eventos de um plano antigo contra o alvo do plano novo misturaria réguas (refeições/positions de planos diferentes nem pareiam). Coerente com `registro-consumo.ts` (já filtra por `plan_id`).

**Alternatives considered**: ler eventos de qualquer plano e avaliar contra o alvo do ativo (rejeitado: mistura réguas e quebra o pareamento por position); usar o `plan_id` do evento como régua por dia (rejeitado no gate — Assumption explícita da spec).
