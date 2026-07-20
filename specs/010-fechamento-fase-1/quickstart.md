# Quickstart — 010-fechamento-fase-1

## Subir o ambiente

```bash
docker compose up -d                      # Postgres
node --env-file=.env --import tsx packages/db/scripts/seed.ts   # semeia (imprime patientId)
pnpm --filter api dev                     # API em :3333
pnpm mobile:dev                           # seed + .env do app + Expo iOS (terminal 2)
```

## Verificar a US1 (nutrição da alternativa, sob gate)

1. Descobrir um item flexível: `GET /patients/:patientId/today` → pegar `meals[..].defaultOption.items[..]`
   com `substitutable: true` (anote o `id`).
2. `GET /meal-items/:id/substitutions` com o paciente semeado (exposure do seed):
   conferir cada alternativa com `gramas`, `medidaCaseira` e `nutrition` conforme o nível.
3. Variar o gate direto no banco e repetir a chamada:

   ```sql
   UPDATE patient SET exposure = 'hidden'   WHERE id = '<patientId>';  -- nutrition AUSENTE
   UPDATE patient SET exposure = 'percent'  WHERE id = '<patientId>';  -- só *Pct
   UPDATE patient SET exposure = 'macros'   WHERE id = '<patientId>';  -- macros sem kcal
   UPDATE patient SET exposure = 'full_kcal' WHERE id = '<patientId>'; -- tudo
   ```

4. No app: abrir "Trocar ›" num item flexível → linha de nutrição por alternativa quando o
   gate permite; nada quando `hidden`. Tela de combinar: sem nutrição (esperado).
5. Coerência: `nutrition` da alternativa ≈ macros/100g do alimento × `gramas`/100 (1 casa).

## Verificar a US2 (hardening)

```bash
pnpm --filter mobile test        # consumo.test.ts: montagem do payload (novo)
pnpm --filter api test:e2e       # substitutions.e2e: gate 4 níveis + lista vazia → 200
pnpm --filter @bamboo/core test  # baseline intacto (nada muda no core)
pnpm lint && pnpm format         # done-gate
```

Disciplina test-first (SC-004): os testes novos entram ANTES da implementação e o vermelho
inicial é observado (e2e do gate falha sem o campo; consumo.test falha sem o helper).

## US3 — Roteiro do smoke manual da 005 (desfazer vs rebalanceamento)

Pré: `pnpm mobile:dev` com API+DB de pé. Marcar ✅/❌ em cada item ao executar:

| #   | Passo                                                                         | Esperado                                                                                           | Resultado |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 1   | Numa refeição com 2+ opções, trocar para opção não-default (confirmar prévia) | Opção troca; refeições seguintes mostram ajustes; snackbar "desfazer" visível ~5s                  |           |
| 2   | Tocar "desfazer" no snackbar dentro da janela                                 | Troca E ajustes revertem juntos (atômico); dia volta ao estado anterior                            |           |
| 3   | Repetir a troca e deixar o snackbar expirar                                   | Chip da opção default permanece como caminho durável de desfazer                                   |           |
| 4   | Desfazer pelo chip após expirar                                               | Mesmo efeito atômico do snackbar                                                                   |           |
| 5   | Com troca ativa, re-trocar para 3ª opção                                      | Re-troca substitui a anterior (não empilha ajustes)                                                |           |
| 6   | Substituir um item (dentro do grupo)                                          | "↺ desfazer" por-item aparece SÓ nesse item; itens rebalanceados de outras refeições NÃO mostram ↺ |           |
| 7   | Registrar "feito" numa refeição com item substituído                          | Registro vira "troquei" no card (derivado no servidor)                                             |           |

Resultado do smoke: _preencher na execução_ (falha ⇒ pendência explícita, FR-009 — não
bloqueia US1/US2).

## US3 — Reconciliação (após implementação verde)

- Board Notion: fechar BAM-38/55/56/57 (obsoletos — persistência é via registro troquei,
  `docs/handoff-proximas-fases.md` §8) e BAM-40 (sem objeto — 005 FR-008); BAM-39 aponta pra
  esta feature e fecha com ela.
- Docs: `docs/estado-atual.md` + bloco SPECKIT/header do `CLAUDE.md` → Fase 1 concluída.
