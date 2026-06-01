# Quickstart — Motor de rebalanceamento (Fase 2)

Como rodar e verificar a fatia. Pressupõe o ambiente da Fase 0/1 funcionando (Postgres via Docker, `pnpm install`, TACO ingerida).

## 1. Subir o banco e aplicar a migration

```bash
docker compose up -d            # Postgres 17
pnpm --filter @bamboo/db generate   # gera a migration das 4 colunas de config
pnpm --filter @bamboo/db migrate    # aplica
```

## 2. Semear o plano de demonstração da Fase 2

O seed estende o da Fase 1 com o que o motor precisa para ser exercido:

- 1 nutri + 1 paciente (exposição variável p/ testar o gate).
- Plano com **≥2 tipos-de-dia** (ex.: "treino" e "descanso") e programação semanal.
- Refeições com **opções desiguais** (ex.: almoço leve/pesado) e **itens flexíveis + travados** nas refeições seguintes (pra haver alavanca).
- (Opcional) `nutritionist.default_*` e/ou `patient.*_pct` semeados p/ ver a resolução de 3 níveis.

```bash
pnpm --filter @bamboo/db seed
```

## 3. Testes do núcleo (test-first, o coração)

```bash
pnpm --filter @bamboo/core test
```

Cobre (ver contratos `core-*.md`): resolução de parâmetros 3 níveis; alvo do dia + faixa; rebalanceamento (sem-acao / reduzir / aumentar / recusa estoura-piso / recusa sem-alavanca / kcal-priority / P3 por total-do-dia); combinação (50/50, split ajustado, alvo sem base, fora-do-grupo, medida caseira).

## 4. Exercitar os endpoints

```bash
pnpm dev   # sobe a API

# P1 — prévia ao escolher opção desigual
curl -s -X POST localhost:3000/patients/<id>/rebalance/option-choice \
  -H 'content-type: application/json' \
  -d '{"triggerMealId":"<almoco>","chosenOptionId":"<opcao-pesada>"}' | jq

# P2 — combinação 1→2 (macarrão → arroz + batata)
curl -s -X POST localhost:3000/meal-items/<item>/combine \
  -H 'content-type: application/json' \
  -d '{"alvoFoodIds":["<arroz>","<batata>"],"split":0.5}' | jq

# /today com opções + override display de tipo-de-dia
curl -s localhost:3000/patients/<id>/today | jq '.meals[0].options'
curl -s "localhost:3000/patients/<id>/today?dayTypeId=<descanso>" | jq '.dayType, .currentMealId'
```

## 5. O que observar (critérios da spec)

- **Prévia antes de confirmar** (SC-001): o POST devolve o "depois" das refeições seguintes; nada é aplicado/persistido.
- **Piso respeitado** (SC-002): com desvio grande, `outcome.kind = "recusa-orientada"` (200), nenhuma quantidade abaixo do piso.
- **Só alavancas** (SC-003): itens travados/sem-grupo nunca aparecem em `itensAjustados`.
- **Cabe na faixa** (SC-004): escolha pequena → `outcome.kind = "sem-acao"`, refeições seguintes intactas.
- **Combinação preserva base** (SC-005): soma do nutriente-base das duas partes ≈ a do item original (≤2%).
- **Ação, não número** (SC-006): com `exposure = hidden`, a resposta traz gramas/medidas, sem números nutricionais nem "% de caloria".
- **Resolução 3 níveis** (SC-009): mudar `patient.floor_pct` muda o ponto de recusa, sobrepondo o default da nutri/sistema.
- **Tipo-de-dia no v0** (SC-008): trocar via `?dayTypeId` só re-exibe o cardápio; nenhum rebalanceamento no app.

## Done de cada task

`pnpm lint` + `pnpm format` verdes na raiz (Turborepo) antes de fechar — regra de "done" do projeto.
