# Research — 010-fechamento-fase-1

Decisões da fase 0. Nenhum NEEDS CLARIFICATION restante; **D1 é a decisão de produto
endereçada ao gate** (a spec assume a recomendação).

## D1 — Incluir nutrição da alternativa? (PRODUTO — pro gate)

- **Decision**: SIM (recomendação), sob o gate de exposição existente (`exposure_level` do
  paciente dono do plano do item), com apresentação neutra.
- **Rationale**: o card do item já mostra nutrição quando a nutri libera — a lista de
  alternativas é a mesma classe de informação, no momento exato da decisão; as alternativas
  preservam o nutriente-base do grupo (equivalência por construção), então os números
  reforçam "é equivalente" em vez de induzir caça a caloria; a nutri controla por paciente.
- **Alternatives considered**: (a) NÃO expor (status quo) — defensável pela assinatura "ação,
  não número", mas incoerente com o card que já mostra e deixa o BAM-39 eternamente aberto;
  (b) expor sempre, sem gate — rejeitado: viola a régua LGPD/exposição (Princípio V).
- **Se o gate decidir NÃO**: US1/FR-001–003 caem; US2+US3 fecham a fase sozinhas.

## D2 — Como o endpoint descobre o exposure (rota não tem paciente)

- **Decision**: join na própria consulta do item: `meal_item → meal_option → meal → plan →
patient.exposure` (o passo 1 do service ganha os joins e o campo).
- **Rationale**: no v0 o item identifica unicamente o dono (plano pertence direto ao
  paciente); não muda contrato de rota nem clientes; 1 query, sem round-trip extra.
- **Alternatives considered**: (a) `?patientId=` na query — muda contrato, cliente teria que
  informar o que o servidor já sabe, e cria par contraditório (item de A + id de B);
  (b) rota aninhada `/patients/:id/meal-items/...` — quebra os 3 clientes do endpoint sem
  ganho no v0; (c) esperar o guard de propriedade (EP-3/BAM-42) — ortogonal: o guard
  transversal chega com auth real; o join não conflita com ele.

## D3 — Onde vive a política do gate (não duplicar)

- **Decision**: reusar `nutritionFor(food, gramas, exposure)` exportada de
  `apps/api/src/plan/today.mapper.ts:106` no `substitution.mapper`.
- **Rationale**: é exatamente a mesma régua nível-a-nível do `/today` (FR-002 da spec: "a
  mesma régua do card"); função pura, já testada via e2e do today; import entre módulos do
  mesmo app é aceitável e mantém UMA fonte da política.
- **Alternatives considered**: (a) duplicar no substitution.mapper — duas réguas pra divergir;
  (b) mover pro `packages/core` — rejeitado: exposição é política de apresentação da borda,
  não regra de domínio (o core segue agnóstico de LGPD/UI).

## D4 — Forma do DTO e o ciclo de import nos types

- **Decision**: `SubstitutionAlternativeDto` ganha `readonly nutrition?: NutritionDto`
  (ausente = gate ocultou — mesma convenção do `MealItemDto.nutrition`). `NutritionDto` sai de
  `today.ts` para um novo `packages/types/src/nutrition.ts`; `today.ts` passa a importá-lo de
  lá; o barrel (`index.ts`) re-exporta — consumidores (`@bamboo/types`) não percebem.
- **Rationale**: `today.ts` já importa `HouseholdMeasureDto` de `substitution.ts`; adicionar
  o sentido inverso criaria ciclo — mover o tipo compartilhado para módulo neutro elimina o
  ciclo sem quebrar ninguém. Campo opcional = aditivo/retrocompatível (OpenAPI e clientes).
- **Alternatives considered**: (a) `import type` circular — funciona em TS, mas é fragilidade
  gratuita quando mover o tipo custa 10 linhas; (b) duplicar o shape — divergência futura.

## D5 — Display no app

- **Decision**: `SubstitutionSheet` exibe uma linha discreta de nutrição sob o nome/quantidade
  da alternativa quando `alt.nutrition` existe, usando formatter compartilhado em `format.ts`
  (extrair o miolo de `formatNutritionLine` — hoje ele recebe `MealItemDto`; passa a haver uma
  função sobre `NutritionDto` que ambos usam). `CombineSheet` não exibe (spec/edge case: a
  porção final depende do split).
- **Rationale**: mesma linguagem visual do card = zero conceito novo pro paciente; ausência do
  campo = ausência da linha (o cliente não decide política).
- **Alternatives considered**: tela/tap extra pra "ver detalhes" — fricção sem ganho.

## D6 — Teste da montagem do consumo no mobile (US2a)

- **Decision**: extrair `montarConsumo(activeOption, consumoOverrides, defaultOptionId)` como
  função pura em `apps/mobile/src/consumo.ts` (novo), testada com Vitest;
  `HomeScreen.handleRegistrar` delega (hoje a lógica vive inline em `HomeScreen.tsx:301-316`).
- **Rationale**: padrão estabelecido pela 005 (`swaps.ts` — estado de apresentação puro e
  testável fora do runtime RN); é o insumo do troquei/adesão — a peça de maior valor sem teste.
- **Alternatives considered**: (a) teste de componente (React Native Testing Library) —
  dependência e infra novas pra cobrir 15 linhas de lógica pura; contra o padrão do repo
  (runtime RN = smoke manual); (b) deixar sem teste — é a lacuna que a US2 existe pra fechar.

## D7 — e2e do gate sem vazar estado (lição a2894f3 / KI-001)

- **Decision**: os casos de US1 mudam o `exposure` do paciente semeado via UPDATE direto no
  banco do teste e **restauram no `afterAll`**; nenhum `meal_event` é criado; caso "lista
  vazia" usa cenário sem efeito colateral (grupo sem outro food elegível — ex.: alvo com
  nutriente-base zero é excluído pelo service).
- **Rationale**: a flakiness histórica da suíte veio de estado vazado entre arquivos
  (meal_event não limpo); mutação de `patient.exposure` tem o mesmo potencial — restauração
  explícita mantém a suíte hermética. `today.e2e` já exercita níveis de exposição; seguir o
  padrão dele.
- **Alternatives considered**: semear um segundo paciente por nível — mais setup e mais estado
  compartilhado, sem ganho (o UPDATE restaurado é local à suíte).

## D8 — Smoke manual da 005 (US3)

- **Decision**: roteiro passo-a-passo no `quickstart.md` desta feature (subir com
  `pnpm mobile:dev`, trocar opção → snackbar ~5s, desfazer atômico, chip durável da opção
  default, re-troca substitui, desfazer por-item só em substituir/combinar); resultado
  (ok/falha por item) registrado no próprio quickstart ao executar.
- **Rationale**: é pendência declarada da 005 ("smoke manual da UI pendente"); fechar a fase
  exige executá-lo ou registrar falha como pendência explícita (FR-009).
- **Alternatives considered**: automatizar com Maestro/Detox — infra nova desproporcional ao
  MVP (YAGNI); adiar de novo — contradiz "fechamento".

## D9 — Reconciliação do board e docs (US3)

- **Decision**: ao final da implementação (pós-verde): fechar BAM-38, BAM-55, BAM-56, BAM-57
  (persistir troca — obsoletos; justificativa: persistência via registro troquei, handoff §8)
  e BAM-40 (useState→API — sem objeto; 005 FR-008 tornou o estado local design); BAM-39
  aponta pra esta feature e fecha com ela; atualizar `docs/estado-atual.md` + bloco
  SPECKIT/header do `CLAUDE.md` (Fase 1 concluída). Board é sync manual (memória
  `bamboo-notion-board`) — a atualização é ato desta feature.
- **Rationale**: sem isso o board continua mandando implementar coisa rejeitada por decisão
  documentada — exatamente o que motivou a 010.
- **Alternatives considered**: deletar os cards — perde o rastro da decisão; deixar como está
  — o problema continua.
