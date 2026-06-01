# Contract — extensão do GET /patients/:patientId/today

Estende o contrato da Fase 1 (`001-alca-do-paciente/contracts/get-today.md`) pra habilitar P1 (ver/escolher outras opções) e o lado display-only da troca de tipo-de-dia no v0. **Acréscimo retrocompatível** (D8). US1/US3.

## Mudança 1 — expor todas as opções de cada refeição (FR-025)

Hoje o `MealDto` só expande `defaultOption` e sinaliza `otherOptionsCount`. Passa a trazer **todas** as opções:

```ts
export interface MealDto {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly horario?: string | null;
  // NOVO: todas as opções (a default marcada). Mantém defaultOption por retrocompat.
  readonly options: readonly MealOptionDto[];
  readonly defaultOption: MealOptionDto; // = options.find(o => o.isDefault)
  readonly otherOptionsCount: number; // = options.length - 1 (retrocompat)
}
```

- `MealOptionDto` já carrega `items` (Fase 1): cada item com `food`, `quantityGrams`, `isLocked`, `substitutionGroupId`, `substitutable`, `nutrition?` (filtrada por exposição).
- Os itens das opções **não-default** também respeitam o gate de exposição.

## Mudança 2 — override de tipo-de-dia (display-only, FR-021)

```
GET /patients/:patientId/today?dayTypeId=<uuid>
```

- Sem `dayTypeId`: comportamento atual (resolve o tipo-de-dia pelo weekday).
- Com `dayTypeId`: **exibe** aquele tipo-de-dia (deve pertencer ao plano ativo do paciente), re-ancorando `currentMealId` na 1ª refeição por `position`. **Não rebalanceia** (FR-021/FR-022) — é só a camada grossa de exibição.
- `dayTypeId` inválido / fora do plano → **404**.

## Mudança 3 — medida caseira no item planejado (unidade/fatia)

`MealItemDto` ganha `medidaCaseira?: HouseholdMeasureDto | null`: a medida **preferida** para exibir o planejado em **unidade/fatia** (ovo, fruta, tomate); `null` → exibir em **gramas** (granel: arroz, aveia, carnes). Heurística v0 na casca: filtra medidas cujo rótulo casa `/unidade|fatia/i` e pega a mais próxima (`medidaMaisProxima`). O app exibe `n× label` (ex.: "2× unidade média"). O flag "discreto vs granel" no próprio alimento fica como melhoria futura (precisa da UI da nutri).

## Response (DTO — `packages/types`)

`TodayResponse` inalterado na forma; `meals[].options` agora preenchido. `dayType` reflete o tipo-de-dia exibido (default ou o override).

## Casos de teste (e2e)

- `/today` sem query: `meals[].options` traz default + não-default; default marcada; exposição respeitada em todas as opções.
- `/today?dayTypeId=<descanso>`: troca o cardápio exibido; `currentMealId` re-ancorado; `dayType.label` = "descanso"; nenhum número de rebalanceamento aparece.
- `dayTypeId` de outro plano → 404.

## Notas

- Retrocompatível: o mobile da Fase 1 continua lendo `defaultOption`/`otherOptionsCount`; os campos novos são aditivos.
- Persiste nada; override é escolha de exibição (estado local no app).
