# Implementation Plan: Edição de refeição em lote

**Branch**: `main` (direto, padrão do repo) | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-edicao-de-refeicao/spec.md`

## Summary

O paciente ganha um **modo de edição por refeição**: troca vários itens de uma vez (cada um
dentro do seu grupo, quantidades equivalentes calculadas como hoje) e, ao submeter, vê **uma**
prévia de impacto no resto do dia antes de confirmar. Abordagem: **zero matemática nova** — a
prévia reusa `POST /patients/:id/rebalance/option-choice` com um campo aditivo `items` (o overlay
da composição editada, na MESMA forma do `consumo.items` do registro), e o motor
(`previewTrocaOpcao` em `packages/core`) fica **intocado**: a casca já monta `diaComEscolha`, só
passa a aplicar o overlay na refeição-gatilho. No mobile, a edição é estado de sessão (padrão
`swaps.ts` da 005): um reducer puro novo `edits.ts` + sheet de edição que reusa o
`SubstitutionSheet` como picker e o `RebalancePreviewSheet` para a prévia. O registro existente
(`POST /registro` com `consumo`) já persiste a composição editada — nada novo persiste.

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (workspace pnpm + Turborepo)

**Primary Dependencies**: NestJS + Drizzle (api) · React Native/Expo (mobile) · ts-pattern · sem dependência nova

**Storage**: PostgreSQL — **sem migration**; a feature não cria escrita nova (prévia efêmera; persistência é o `POST /registro` existente)

**Testing**: Vitest — e2e da api com `buildScenario` (013), unit do reducer no mobile

**Target Platform**: API Node (porta 3333 dev) + app Expo (paciente)

**Project Type**: mobile + api (monorepo)

**Performance Goals**: prévia numa requisição (o endpoint já monta o dia inteiro em ~6 queries); nenhuma query N+1 nova

**Constraints**: requisição SEM `items` responde **byte-a-byte** o que responde hoje (aditivo, padrão do `dayTypeId` da 014) · nada persiste na prévia (0 writes) · `packages/core` com `git diff` vazio · exposição nutricional respeitada pelo mapper existente

**Scale/Scope**: 1 endpoint estendido · 1 reducer + 1 sheet novos no mobile · 2 sheets existentes com mudança mínima · ~6 cenários e2e novos

## Constitution Check

- [x] **Núcleo puro** (III): nenhuma regra nova — `previewTrocaOpcao`/`rebalancearPorKcal` já
      cobrem o caso; aplicar o overlay é montagem de dados, responsabilidade que a casca já tem (é
      como refeições registradas entram no `diaComEscolha` hoje). Core intocado é critério de sucesso.
- [x] **Casca fina** (III): validação estrutural na borda (padrão `registro.controller`),
      `Result`→`HttpException` já existente no `rebalance.service`; response via mapper puro existente.
- [x] **Tese** (I/II): é literalmente "adaptar à vida real" — refeição inteira trocável, prévia
      mostra a consequência ANTES de agir, ação (quantidades novas) em vez de número, recusa orientada
      quando não dá; nunca barra o caminho item a item existente.
- [x] **LGPD** (V): nenhuma exposição nova — endpoints do paciente existentes, gate de exposição
      nutricional preservado pelo mapper.
- [x] **Escopo** (VI): sem `Effect`/`fp-ts`, sem dependência nova, sem migration; comida fora da
      lista continua Fase 4.
- [x] **TDD** (IV): e2e do overlay escritos antes (RED visto), reducer do mobile test-first;
      backward-compat provada por suíte existente com `git diff` vazio.

## Project Structure

### Documentation (this feature)

```text
specs/020-edicao-de-refeicao/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # decisões D1–D9
├── data-model.md        # estado de sessão + overlay (sem schema novo)
├── quickstart.md        # verificação manual
├── contracts/
│   └── option-choice-items.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/types/src/
├── rebalance.ts         # OptionChoiceRequest.items? (aditivo)
└── registro.ts          # (só leitura — a forma do item de consumo é a referência)

apps/api/src/rebalance/
├── rebalance.service.ts # validação do overlay + aplicação no diaComEscolha (bloco do gatilho)
└── rebalance.controller.ts  # descrição Swagger (padrão 014: sem requestBody modelado)

packages/api-client/src/
└── rebalance.ts         # corpo aceita items? (pass-through)

apps/api/test/
└── edicao-refeicao.e2e-spec.ts  # novo, self-contained via buildScenario (013)

apps/mobile/src/
├── edits.ts             # reducer puro do modo de edição (padrão swaps.ts) + edits.test.ts
├── MealEditSheet.tsx    # novo: o formulário de edição (reusa SubstitutionSheet como picker)
├── RebalancePreviewSheet.tsx  # prop opcional: itens editados entram no corpo da prévia
└── HomeScreen.tsx       # botão "editar", estado edits, confirmar/desfazer atômicos
```

**Structure Decision**: mobile + api do monorepo existente; nenhum módulo novo na api (a extensão
mora no `rebalance/` da 002/014); no mobile o padrão 005 (reducer puro + sheet) se repete.

## Decisões (resumo — detalhe em research.md)

- **D1** Prévia = `option-choice` com `items?` aditivo; endpoint novo rejeitado (duplicaria a montagem do dia).
- **D2** Forma do overlay = a do `consumo.items` do registro — o que a prévia avalia é o que o registro grava.
- **D3** Overlay aplicado na casca; core com diff vazio.
- **D4** Validação da prévia: estrutural + pertencimento; grupo NÃO é re-validado (o registro é o enforcement; `ponytail:` no código).
- **D5** Mobile: `edits.ts` guarda `previous` + ajustes por refeição; display/consumo continuam em `nameOverrides`/`consumoOverrides` (fonte única de render); desfazer atômico da última edição.
- **D6** A prévia não enxerga adaptações efêmeras de outras refeições (idêntico à troca de opção hoje) — resíduo aceito, documentado.
- **D7** Item à vontade: troca só de nome, fora do payload (0 g não contribui e o registro rejeita ≤ 0).
- **D8** UI: `MealEditSheet` novo; `SubstitutionSheet` reusado como picker aninhado; `RebalancePreviewSheet` reusado para a prévia.
- **D9** Sequenciamento: backend primeiro — há sessão paralela ativa editando os arquivos do mobile; o mobile é feito por último, re-lendo o estado corrente da árvore.

## Complexity Tracking

Sem violações — tabela vazia.
