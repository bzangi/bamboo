# Quickstart — verificar a 009

Pré: DB seeded (`bamboo-postgres`), API e app configurados (`EXPO_PUBLIC_PATIENT_ID`). Hoje (qua) o tipo padrão é **treino**; o alvo da troca é **descanso** (alvo menor).

## A) API — caminho de troca de tipo-de-dia (US1 + US2)

1. Registrar o café do **treino** como `feito`:
   `POST /patients/:id/registro { mealId: <café treino, pos 1>, intent: "feito" }`
2. `GET /patients/:id/today?dayTypeId=<descanso>` e conferir:
   - **Badge pareado** (US1): a refeição da **pos 1** (café) vem `registro: { state: "feito" }`.
   - **Sinal** (US2): café (pos 1) vem `rebalanceado: false` (registrada, single-count); almoço/jantar (pos 2/3) vêm `rebalanceado: true` (grama < planejado, excesso reduzido respeitando piso 50%).
   - **INV-4**: as `quantityGrams` são iguais às de antes da feature (a 009 não muda número).
3. Repetir com `pulei` e `troquei` → o badge pareado reflete o mesmo estado; o sinal segue só nas reconciliadas.
4. Sem consumo / `GET /today` sem `?dayTypeId` → `rebalanceado: false` em tudo; `registro` por `mealId` (comportamento da 004 intacto).

## B) App (mobile) — smoke manual

1. Abrir no dia de treino, marcar o café como **feito**.
2. Tocar "trocar ›" → escolher **descanso**.
3. Conferir:
   - O **café do descanso** mostra **✓ Feito** (badge pareado), **display-only** (sem ação de desfazer/corrigir sob override).
   - **Almoço e jantar** mostram o **sinal "ajustado"** com frase de porquê (ex.: "Ajustei o resto do dia porque você já comeu"), **sem número/percentual**.
   - O café (registrado) **não** mostra o sinal "ajustado".
4. Voltar ao tipo padrão (ou re-trocar) → o sinal some; coerência mantida.
5. **Troca de opção** (US4): trocar a opção de uma refeição que rebalanceia as outras → as outras mostram o **mesmo** sinal; desfazer a troca (005) remove o sinal.

## C) Testes automatizados

- `apps/api`: `pnpm vitest run test/today-daytype.e2e-spec.ts` — novos casos (badge pareado feito/pulei/troquei; `rebalanceado` só nas reconciliadas; registrada não sinaliza; INV-1..4) + os 7 existentes verdes.
- `apps/api`: unit dos mapeadores puros (`rebalanceado`, registro-por-posição).
- `apps/mobile`: `pnpm vitest run` — seletor puro `deveSinalizar` (server flag OU swaps).

## Done quando

Todos os SC da spec verdes (SC-001..006), e2e + units verdes, `tsc`/lint limpos, smoke manual do app ok.
