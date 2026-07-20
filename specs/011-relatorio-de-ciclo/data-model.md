# Data Model — 011-relatorio-de-ciclo

**Nenhuma mudança de schema. Nenhuma migration. Nada persiste** (FR-008 — relatório é
derivado; a decisão antiga de NÃO ter tabela `cycle_report` permanece).

## Fontes (tudo existente)

| Peça                                                                    | Fonte                                                  | Feature                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| Janela do ciclo (startedOn/closedOn/duração), vigências                 | `cycle`, `cycle_plan_vigencia`                         | 007                            |
| Estados vigentes por (dia, refeição)                                    | `meal_event` (append-only, last-wins, anulação)        | 003                            |
| Adesão diária (valorPct/dentroFaixa/flags/cobertura, com-dado/sem-dado) | `AdesaoService.serie()`                                | 006                            |
| Refeições esperadas por dia (position+nome do tipo-de-dia do alvo)      | `day_schedule`/`day_type`/`meal` via regra Q3-B da 006 | 006 (loader generalizado aqui) |

## Shapes derivados (novos, só em `packages/types/src/relatorio.ts`)

```ts
// Agregado de adesão de uma janela (ciclo inteiro ou semana)
AdesaoAgregada {
  media: number | null;        // média dos dias com-dado; null se nenhum (régua 006)
  diasComDado: number;
  diasSemDado: number;
  coberturaMedia: number | null; // média das coberturas dos dias com-dado
  diasDentroFaixa: number;      // entre os com-dado
  flagsFrequencia: { carb?: {acima,abaixo}, protein?: …, fat?: … } // contagens; ausente se zero
}

// Padrão de registro de uma janela
RegistroAgregado {
  totais: { feito, troquei, pulei, semRegistro }   // contagens de refeição-dia
  porRefeicao: [{ position, nome, feito, troquei, pulei, semRegistro }]
}

// Semana do ciclo (A1 — relativa ao início; última pode ser parcial)
SemanaDoCiclo {
  indice: number;              // 1-based
  from, to: 'YYYY-MM-DD';      // intervalo real da fatia (to inclusive)
  parcial: boolean;            // fatia < 7 dias
  adesao: AdesaoAgregada;      // da fatia
  registro: RegistroAgregado['totais'];  // totais da fatia (sem quebra por refeição)
}

// Comparativo (A3)
Comparativo {
  cicloAnterior: { id, startedOn, closedOn, adesao: AdesaoAgregada,
                   registroTotais: RegistroAgregado['totais'] };
  deltas: { media: number|null; coberturaMedia: number|null;
            taxaFeito: number|null; taxaTroquei: number|null; taxaPulei: number|null };
            // atual − anterior; null quando um dos lados é sem-dado
}

CycleReportResponse {
  cycle: { id, startedOn, closedOn: string|null, expectedDurationDays, aberto: boolean,
           janelaEfetiva: { from, to } };            // aberto: to = hoje (A2)
  adesao: AdesaoAgregada;                            // do ciclo
  registro: RegistroAgregado;                        // do ciclo (com quebra por refeição)
  semanas: SemanaDoCiclo[];                          // ordem cronológica
  comparativo: Comparativo | null;                   // null = sem ciclo anterior
}
```

Taxas do comparativo: `taxaX = X ÷ (feito+troquei+pulei+semRegistro)` da janela de cada
ciclo (proporção, robusta a durações diferentes entre ciclos).

## Conceitos novos (apresentação, não persistência)

- **Semana do ciclo**: fatia de 7 dias relativa ao `startedOn` (D1); última parcial marcada.
- **Janela efetiva**: `startedOn → closedOn` (fechado) ou `startedOn → hoje` (aberto — D2).
- **Ciclo anterior**: `closedOn` mais recente ≤ `startedOn` do consultado; desempate pelo
  aberto mais recentemente (D3).
- **Sem-registro**: (dia, position) esperado sem estado vigente — anulado conta aqui (D9).

## Estados & transições

Nenhum novo. A consulta é somente-leitura (SC-006): nenhuma linha criada/alterada.
