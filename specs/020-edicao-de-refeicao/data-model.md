# Data Model — 020 Edição de refeição em lote

**Sem migration. Nenhuma tabela, coluna ou índice novo.** A prévia é efêmera (0 writes) e a
persistência da composição editada é o caminho existente do registro
(`meal_event` + `meal_event_item`, snapshot do "troquei" da 004/D3b).

## Contrato estendido (aditivo)

`OptionChoiceRequest` (`packages/types/src/rebalance.ts`):

```ts
{
  triggerMealId: string;   // existente
  chosenOptionId: string;  // existente — na edição, a opção ATIVA (pode ser a default)
  dayTypeId?: string;      // existente (014)
  items?: ReadonlyArray<{  // NOVO, opcional — overlay da composição editada
    itemId: string;        // meal_item da opção escolhida
    foodId: string;        // alimento consumido no lugar
    quantityGrams: number; // > 0, calculado pelo servidor via /substitutions
  }>;
}
```

- Mesma forma de `RegistroConsumo.items` (D2). Múltiplas entradas por `itemId` = combinação.
- Item da opção **sem** entrada no overlay → composição planejada (inalterado).
- Ausência de `items` → comportamento atual byte-a-byte.

Response: `OptionChoiceResponse` **inalterado** (`sem-acao` | `rebalanceado` | `recusa-orientada`).

## Estado de sessão novo (mobile, efêmero)

`apps/mobile/src/edits.ts`:

```ts
type ItemPrevious = {
  readonly name?: NameOverride; // o que nameOverrides[itemId] era antes (ausente = não havia)
  readonly consumo?: ConsumoItem[]; // idem para consumoOverrides[itemId]
};

type MealEdit = {
  readonly previous: Readonly<Record<string, ItemPrevious>>; // por itemId editado
  readonly adjustments: Readonly<Record<string, string>>; // itemId de OUTRAS refeições → rótulo novo
};

type EditState = Readonly<Record<string, MealEdit>>; // por mealId
```

Regras (invariantes do reducer):

- **Confirmar** grava trocas em `nameOverrides`/`consumoOverrides` (fonte única de render e de
  consumo — D5) e registra `previous` + `adjustments` em `edits[mealId]`.
- **Desfazer** é atômico: restaura cada `previous` (repõe ou remove) e descarta os ajustes.
- **Re-editar** substitui a edição da refeição (last-edit-wins; `previous` da nova edição é o
  estado corrente, já com a anterior aplicada).
- Trocar tipo-de-dia reseta `edits` junto com os demais estados (regra existente).

## Estados e transições (refeição, do ponto de vista do paciente)

```
planejada ──editar──▶ edição pendente ──submeter──▶ prévia ──confirmar──▶ adaptada (efêmero)
   ▲                        │ cancelar                  │ recusa/fechar        │ desfazer
   └────────────────────────┴───────────────────────────┴──────────────────────┘
adaptada ──"Feito"──▶ registrada "troquei" (persistido: meal_event + meal_event_item)
registrada ──✗──▶ (modo de edição indisponível)
```
