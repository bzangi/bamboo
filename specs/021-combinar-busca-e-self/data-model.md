# Data Model: Busca + alimento de origem no modo de combinar

Sem schema novo, sem migration, sem entidade nova. O que muda é a **forma de um parâmetro de
consulta** e, por consequência, o **conteúdo** (não a forma) de uma resposta já existente.

## Parâmetro — `includeSelf` (query, opcional)

| Campo         | Tipo                                                               | Default           | Efeito                                                                                                |
| ------------- | ------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `includeSelf` | string truthy (`"true"`/`"1"`, no padrão frouxo dos demais params) | ausente = `false` | quando truthy, o alimento do próprio `meal_item` entra em `alternatives` junto com os demais do grupo |

Sem o parâmetro (ou com valor falsy), `GET /meal-items/:id/substitutions` responde **byte-a-byte**
o que responde hoje — inclusive continua excluindo o food atual (comportamento travado pela suíte
existente).

## Resposta — `SubstitutionAlternativeDto` (inalterada na forma)

Nenhum campo novo. A única diferença observável é que, com `includeSelf=true`, uma das entradas de
`alternatives` pode ter `foodId` igual ao `current.foodId` da mesma resposta — com `gramas` igual à
quantidade atual do item (identidade: mesmas macros ⇒ mesma conta de `substituir()`).

## Estado de UI — `useAlternativesSearch` (novo, cliente apenas)

Não é persistência — é o mesmo formato de estado que já existia dentro do `SubstitutionSheet`,
agora nomeado e reutilizável:

```ts
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: SubstitutionsResponse;
      fim: boolean;
      carregandoMais: boolean;
    };
```

`CombineSheet` acrescenta, por cima do hook, o estado que já tinha: `selected` (até 2 `foodId`s) e
`split`. Nada disso persiste além da sessão do sheet aberto.
