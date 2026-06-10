# Handoff — próximas features (pós-Fase 4)

> Briefing para um agente executar o roadmap do board em paralelo, com **worktrees**, enquanto o dono (Bruno) atua em outras frentes. Escrito por outro agente em 2026-06-10, logo após fechar a Fase 4.

## 0. Leia primeiro (fonte da verdade)

1. **`CLAUDE.md`** — constituição, arquitetura, paradigma funcional, fluxo Spec-Driven. **Manda em tudo.**
2. **`docs/estado-atual.md`** — snapshot do estado real (em conflito com o header do CLAUDE.md, o snapshot vence).
3. **`specs/001..004/`** — as 4 features concluídas. **São o seu modelo** de spec → plan → tasks → research → contracts → quickstart. Imite o nível de rigor.
4. **Board Notion "Backlog & Roadmap"** (panorama/gestão, sync manual): https://www.notion.so/3713a2fcd17b81b48e90d41fba872d02 — data source `collection://d725049f-8fae-4f29-921c-ccff47e47803`. Épicos EP-1…EP-9, props Tipo/Status/Área/Fase/Prioridade/Paralelizável, hierarquia Item pai/Subitens, dependências Depende de/Bloqueia. **Atualize o Status dos cards conforme avança** (ele não sincroniza com o repo sozinho).

## 1. Estado atual

Fases 0–4 **implementadas e testadas** (tudo patient-facing): alça do paciente (`001`), rebalanceamento (`002`), registro feito/troquei/pulei (`003`), motor lê o registro (`004`). **core 90 + e2e 61 verdes.** A **nutri ainda não tem nada** (web é boilerplate; sem relatório; sem auth real).

Stack: pnpm+Turborepo · NestJS+Drizzle+Postgres · RN/Expo (mobile) · Next.js (web nutri, ainda vazio) · Vitest. Núcleo puro em `packages/core`; casca em `apps/api`.

## 2. A REGRA que molda todo o paralelismo

**Nada nesta leva tem spec ainda.** Pela Constituição (Princípio IV, Spec-Driven, NON-NEGOTIABLE):

- **Nenhum código de feature sem spec aprovada.** Para CADA feature: `Constitution → Specify → Plan → Tasks → Implement`, nessa ordem, com os gates.
- **Não invente regra de negócio.** Onde o produto for ambíguo (e vai ser — ver §5), **PARE e pergunte ao Bruno** (assíncrono — junte as perguntas num lote). Não preencha lacuna sozinho.
- **Gates de planejamento são do Bruno.** Specify→Plan e Plan→Tasks só avançam com aprovação dele. Como ele está em outras frentes: **rascunhe a spec, levante as perguntas de produto, e espere o aval async** antes de implementar. A **execução** depois do plano aprovado é autônoma (ver `memory: bamboo-execucao-autonoma-por-fase`).

⇒ Consequência prática: o que dá pra paralelizar **agora** é o **rascunho das specs** (uma por feature, em paralelo) + o levantamento das perguntas. A **implementação** de cada uma só destrava quando a spec/plano dela estiver aprovada. Não tente "implementar a sequência" direto — quase tudo depende de decisão de produto do Bruno.

## 3. Sequência alvo (recomendada pelo agente anterior)

Tudo até aqui é do paciente; a nutri (quem paga) não tem entrega. O maior valor é a cadeia **acompanhamento** (a tese: "ciclo de acompanhamento"; o relatório de ciclo é "a feature que vende"):

1. **Adesão** (core, lê o registro já persistido) — métrica pura, sem UI. Fundação do resto.
2. **Ciclo (objeto) + Relatório de ciclo** (API, seed-first) — provar o valor **sem** depender da web ainda.
3. **UI da nutri (web)** — entrega o relatório; aqui **auth real + LGPD** entram junto (a nutri loga).

Seed-first: prova o miolo antes de construir a casca web.

## 4. Grafo de dependências → o que paraleliza

Cada track = um **git worktree** próprio (branch isolada), specado e implementado de forma independente.

**Paralelizável já (specar em paralelo; independentes entre si):**

- **A — Adesão** (Core/Backend, EP-5): métrica a partir do `meal_event`. Função pura no core + leitura na casca. _Fundação do relatório._
- **B — Ciclo (objeto)** (DB/Backend, EP-5): schema que versiona planos no tempo (hoje o plano é direto no paciente). Migration nova. _Fundação do relatório._
- **C — Auto-classificação de alimentos em grupos** (Core/DB, EP-5/EP-1): heurística/algoritmo pra encaixar foods em `substitution_group`. Independente.
- **D — Fixar substituto no plano** (EP-2, reframado — Backlog/Fase 4): feature nova, escrita no plano (≠ troquei). Independente. Baixa urgência.
- **E — Reduzir fricção** (EP-7): import por IA (PDF→estruturado), offline, notificações, comida fora da lista. Independentes entre si; offline/notificações tocam o mobile.

**Sequenciais (não paralelize — dependem dos de cima):**

- **Relatório de ciclo** ⟵ depende de **A + B**.
- **UI da nutri (web)** (EP-6) ⟵ depende do **Relatório** + **auth real**.
- **Auth real + endurecer LGPD** (EP-3, Transversal) ⟵ vira **obrigatório** quando a web da nutri entrar (a nutri loga, vê dado de saúde de N pacientes). Pode começar a ser specado em paralelo, mas é sensível — alinhe com o Bruno.

**Ordem prática:** rascunhe specs de **A, B, C** em paralelo (3 worktrees) → leve as perguntas de produto ao Bruno → implemente as aprovadas → **Relatório** → **web + auth**. D e E entram quando houver folga / prioridade do Bruno.

## 5. Perguntas de produto a levantar ANTES de implementar (não invente)

- **Adesão:** qual a fórmula? (% de refeições "feito"? dentro-da-faixa por nutriente? como pesam `troquei`/`pulei`? janela = dia/semana/ciclo?) Como a nutri vê (e o paciente **não** vê número de adesão — FR-015/LGPD)?
- **Ciclo:** duração? como envolve/versiona planos? o que dispara um novo ciclo? transições/histórico?
- **Relatório de ciclo:** o que mostra exatamente (métricas, período, comparativos)? formato? é o que "vende" — alinhar conteúdo com o Bruno.
- **Web da nutri:** modelo de auth (a nutri loga; pool de pacientes), escopo do MVP da UI.
- **Auto-classificação:** heurística vs tabela vs IA? confiança/override manual?
- **Fixar substituto (EP-2 b):** fixa por item? por grupo? reverte como?

## 6. Como trabalhar (convenções do repo — não reinvente)

- **Functional core / imperative shell:** regra = função **pura** em `packages/core` (sem I/O, sem `throw`, sem mutação; retorna `Result<T,E>`; erros = discriminated unions com `ts-pattern .exhaustive()`). Casca em `apps/api` faz I/O (Drizzle, `db.transaction`, locks) e converte `Result`→`HttpException` na borda. Imutabilidade (readonly/spread). Response sempre via DTO puro (nunca serializar entidade do Drizzle).
- **TDD não-negociável:** teste que FALHA primeiro → vê o vermelho → implementa → verde.
- **LGPD transversal:** dado de saúde; paciente vê **ação**, não número; gate de exposição.
- **Worktrees:** uma branch/worktree por track (ex.: `git worktree add ../bamboo-adesao -b feat/adesao`). Trabalhe isolado; ao ficar verde, integre na `main` (o padrão do dono é commit+push direto na `main` — ver `memory: bamboo-git-direct-to-main`; para tracks paralelas, branch → merge na main quando verde, evitando conflito entre worktrees). Co-Authored-By no commit conforme o padrão da Fase 4.
- **Verificação adversarial por fase:** o padrão usado na Fase 4 — agentes implementadores em arquivos disjuntos + 1 verificador que roda os comandos REAIS e devolve evidência; o dono revisa o verde. Imite.

## 7. Ambiente / comandos

- Postgres em `localhost:5434` (`.env` na raiz). **Comandos que tocam o DB precisam de acesso a localhost** (no sandbox: `dangerouslyDisableSandbox`).
- Re-semear: `node --env-file=.env --import tsx packages/db/scripts/seed.ts`
- Núcleo: `pnpm --filter @bamboo/core test` (baseline **90**) · typecheck: `pnpm --filter @bamboo/core check-types`
- API: `pnpm --filter api build` · e2e: `pnpm --filter api test:e2e` (baseline **61**, `fileParallelism:false`, **seed antes**)
- Done-gate de toda task: `pnpm lint` + `pnpm format` na raiz, verdes. (Atenção: `pnpm format` já normalizou os `.md` dos specs — não re-normalize como ruído.)
- Mobile (Expo/RN): só código aqui; typecheck sim, runtime é smoke manual.

## 8. Não fazer

- Não implementar nada sem spec aprovada. Não inventar fórmula de adesão / modelo de ciclo / conteúdo de relatório — **pergunte**.
- Não mexer no núcleo do rebalanceamento (`packages/core/src/rebalance.ts`) sem motivo — a matemática está fechada e testada (D1 da Fase 4).
- Não persistir rebalanceamento (é efêmero por decisão, FR-014). A persistência de troca é via **registro** (troquei + snapshot D3b), não via "salvar no plano" — exceto a feature **D** (fixar substituto), que é justamente a exceção deliberada e ainda não specada.
