# Contract — GET /patients/:id/today

Resolve o plano do dia para o paciente: tipo-de-dia anunciado + refeições do dia (opções → itens) com nutrição filtrada pelo gate de exposição. Alimenta a US1 ("ver o agora").

## Request

```
GET /patients/:patientId/today
```

- `patientId` (path, uuid).
- v0: o paciente é fixo via env (auth stub); `patientId` deve casar com o paciente semeado.

## Comportamento

1. Resolve o `day_type` do dia corrente via `day_schedule` (weekday do relógio do servidor/local).
2. Carrega as refeições do `day_type` (ordenadas por `position`), suas `meal_option` (a default destacada) e os `meal_item` da default.
3. Calcula nutrição por item/refeição e **filtra pelo `patient.exposure`** (DTO puro, na borda).
4. Marca `currentMealId` = primeira refeição por `position` (v0; ver research D3).

## Response 200 (DTO — `packages/types`)

```jsonc
{
  "patientId": "uuid",
  "exposure": "hidden | percent | macros | full_kcal",
  "dayType": { "id": "uuid", "label": "dia de treino" },
  "currentMealId": "uuid", // v0: a 1ª refeição
  "meals": [
    {
      "id": "uuid",
      "name": "Almoço",
      "position": 2,
      "horario": "12:30", // opcional; ausente/null se não definido
      "defaultOption": {
        "id": "uuid",
        "label": "Almoço padrão",
        "isDefault": true,
        "items": [
          {
            "id": "uuid",
            "food": { "id": "uuid", "name": "Arroz branco cozido" },
            "quantityGrams": 120,
            "isLocked": false,
            "substitutionGroupId": "uuid | null",
            "substitutable": true, // = !isLocked && substitutionGroupId != null
            // nutrition presente conforme exposure (ausente em 'hidden'):
            "nutrition": { "kcal": 156, "carb": 34, "protein": 3, "fat": 0.3 },
          },
        ],
      },
      "otherOptionsCount": 2, // sinaliza que há outras opções (não as expande no v0)
    },
  ],
}
```

### Regras de exposição (na borda)

- `hidden`: omitir `nutrition` de todos os itens.
- `percent`: incluir só proporções (sem kcal absoluto).
- `macros`: incluir macros (+ %), sem kcal cheio.
- `full_kcal`: incluir tudo.

## Erros

- `404` se o paciente não existe ou não tem plano ativo / programação para hoje.
- (v0 não trata auth real — paciente fixo.)

## Notas

- Escolher outra opção da refeição (e o rebalanceamento que dispara) é **fora de escopo** — por isso só a `defaultOption` é expandida; `otherOptionsCount` apenas sinaliza.
- A response **nunca** serializa entidade do Drizzle crua (Princípio III): montada por função pura DTO.
