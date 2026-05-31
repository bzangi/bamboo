# Quickstart — Alça do paciente

Como subir e verificar a fatia (US1 + US2) depois de implementada. Pré-requisito: Bloco 1 de pé (monorepo + Postgres).

## 1. Infra

```sh
corepack enable && pnpm install
cp .env.example .env          # ajuste POSTGRES_PORT se 5432 estiver ocupada
docker compose up -d          # Postgres (confirme: docker compose ps -> healthy)
```

## 2. Banco (T2 + T3 + T6)

```sh
pnpm --filter @bamboo/db db:generate   # gera migration do schema (inclui meal.horario)
pnpm --filter @bamboo/db db:migrate    # aplica no Postgres
pnpm --filter @bamboo/db ingest:taco   # popula food + medidas caseiras (T3)
pnpm --filter @bamboo/db seed          # nutri + paciente + grupos + plano + refeições + itens (T6)
```

Após o seed deve existir: 1 paciente, ≥1 plano ativo com tipos-de-dia, `day_schedule` cobrindo a semana, refeições com opções (incl. um almoço com 2–3 opções) e itens com mix travado/flexível, e ≥1 item flexível com substitutos no grupo.

## 3. API (T5)

```sh
PORT=3002 pnpm --filter api start      # ajuste a porta se necessário
```

Verificações:

```sh
# US1 — ver "o agora"
curl -s localhost:3002/patients/<PATIENT_ID>/today | jq
#   -> dayType.label presente; meals[] ordenadas; currentMealId = 1ª refeição;
#      nutrition presente/ausente conforme exposure.

# US2 — substituições de um item flexível
curl -s localhost:3002/meal-items/<FLEX_ITEM_ID>/substitutions | jq
#   -> alternatives[] do mesmo grupo, com gramas + medidaCaseira.

# item travado -> a UI não chama; se chamado, retorna não-substituível.
```

## 4. App (T7 + T8)

```sh
PATIENT_ID=<seed> pnpm --filter mobile start   # auth stub: paciente fixo por env
```

- **US1**: a Home mostra "Hoje: <tipo-de-dia>" anunciado + a refeição do momento + lista do dia.
- **US2**: tocar num item flexível abre as alternativas (quantidade + medida caseira); escolher atualiza a refeição na tela; item travado não abre troca.

## 5. Testes do núcleo (test-first, T4)

```sh
pnpm --filter @bamboo/core test     # Vitest: troca normal, arredondamento, err (nutriente-base-zero / fora-do-grupo), preservação ≤2%
```

## Critérios de aceite (mapa para a spec)

| Verificação                                              | Spec                        |
| -------------------------------------------------------- | --------------------------- |
| Home mostra "o agora" + tipo-de-dia sem navegar          | SC-001, SC-006, FR-001..006 |
| Substituições do mesmo grupo com gramas + medida caseira | SC-002, FR-007..010         |
| Preservação do nutriente-base ≤ 2%                       | SC-003, FR-009              |
| Item travado nunca oferece troca                         | SC-004, FR-012              |
| Substituir em ≤ 2 toques, refeição atualiza              | SC-005, FR-011              |
| Grupo sem substitutos informa (não barra)                | SC-007, FR-014              |
| Exposição respeitada                                     | FR-005, FR-016              |
| `meal.horario` exibido quando definido                   | FR-005a                     |
