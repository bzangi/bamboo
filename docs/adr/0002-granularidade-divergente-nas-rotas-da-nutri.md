# O tipo-de-dia alvo fica com duas implementations, e as rotas da nutri com granularidades diferentes

**Status:** accepted · **Data:** 2026-07-26 · **Origem:** candidato 05 da revisão de
arquitetura de 2026-07-25, avaliado depois das features 012 e 013

## Contexto

Duas divergências foram agrupadas sob "candidato 05" na revisão de arquitetura. Avaliando-as
separadamente, elas **não são o mesmo tipo de coisa** — e é isso que este ADR registra.

### (1) A regra do tipo-de-dia alvo tem duas implementations

Resolver "contra qual tipo-de-dia este dia é medido" (a decisão **Q3-B** da feature 006) existe
duas vezes:

- `apps/api/src/adesao/adesao.service.ts` — snapshot uniforme dos registros do dia; senão
  fallback no `day_schedule` **do plano ativo hoje** (`:174`,
  `where(eq(daySchedule.planId, plan.id))`, onde `plan` é o ativo na consulta).
- `apps/api/src/relatorio/relatorio.loader.ts` — mesma regra de snapshot, mas o fallback é
  **vigência-aware**: usa o plano que vigia **naquele dia**, via `cycle_plan_vigencia`
  (`planoVigenteEm`, `:56`/`:108`).

A duplicação foi **deliberada** quando o relatório foi construído (011, decisão D6, "Plano B"
do research): extrair a resolução do `adesao.service.ts` faria a régua da adesão — que a nutri
já usa — depender de código novo, e o critério de sucesso da 011 era não mexer nela. A feature
012 manteve a decisão explicitamente.

### (2) As duas rotas da nutri contam com granularidades diferentes

- `GET /nutri/patients/:id/cycles/:cycleId` — retrato **cru por evento**; o DTO expõe `mealId`
  (`ciclo.mapper.ts:33`).
- `GET /nutri/patients/:id/cycles/:cycleId/report` — **agregado**; o DTO tem `position` e
  `nome`, e **não tem `mealId`** (`packages/types/src/relatorio.ts:29-30`), porque o agregado
  precisa de um denominador de refeições esperadas para existir `semRegistro`.

## Decisão

**Manter as duas implementations do tipo-de-dia alvo, e manter as duas granularidades.** Não
unificar nenhuma das duas agora.

Mas **separando o que é design do que é defeito**:

- A **diferença de granularidade** entre as duas rotas é **deliberada e legítima**. São
  perguntas diferentes: "o que foi registrado, evento por evento" e "como o ciclo se comportou
  contra as refeições esperadas". O DTO do relatório é **estruturalmente incapaz** de expressar
  duas refeições na mesma `position` — e isso é consequência de ser um agregado, não descuido.
- O **descarte silencioso sob colisão** de `position` **é defeito**, não design: quando duas
  refeições de tipos-de-dia diferentes ocupam a mesma `position` num dia, o
  `new Map([position, state])` do `relatorio.loader.ts` resolve por **último-ganha arbitrário**,
  e o estado perdido **não vira `semRegistro`** — desaparece dos totais. Dois fatos entram, um
  sai, sem rastro. Fica registrado em **KI-002 (Sintoma B)**, com teste de caracterização em
  `apps/api/test/colisao-position.e2e-spec.ts`.

## Por que não unificar o tipo-de-dia alvo agora

**Não há bug conhecido.** As duas implementations concordam no caminho normal: quando os
registros do dia têm um único `dayTypeId`, o snapshot decide e o fallback nem é consultado. Elas
só divergem quando (a) o dia não tem registro uniforme **e** (b) o plano vigente naquele dia é
diferente do ativo hoje — o que exige uma troca de plano ativo no meio da janela consultada.

E unificar **muda número que a nutri já viu.** Nas duas direções:

- Adotar a versão vigência-aware na adesão é mais **correto** — mas recalcula a adesão de dias
  passados contra outro alvo. A régua corrente é uma decisão explícita da 006 (D8: "plano ativo
  + tolerância vigentes na consulta, inclusive pro passado").
- Adotar a versão do plano-ativo-hoje no relatório é uma **regressão** de correção.

Ou seja: é decisão de produto sobre histórico, não refactor. E o custo de manter a duplicação é
baixo — a regra do snapshot é a mesma nos dois; só a fonte do plano no fallback difere, e a
diferença está documentada nos dois arquivos.

## O que faria este ADR ser reaberto

- Uma terceira implementation aparecer. Duas cópias com motivo documentado é uma decisão; três é
  uma tendência, e aí a extração se paga.
- A nutri trocar de plano ativo no meio de um ciclo com frequência — aí (a) e (b) coincidem na
  prática, e a divergência sai do papel.
- Uma decisão de produto sobre se a adesão do passado pode ser recalculada.

Em qualquer um dos casos: escrever antes o teste que exercita o cenário divergente (dia sem
registro uniforme + troca de plano ativo dentro da janela). Ele não existe hoje, e sem ele a
unificação não é verificável — o mesmo erro que o ADR-0001 evitou.

## Consequência não-óbvia

O construtor de cenário da feature 013 (`buildScenario`) torna esse teste **barato** — declarar
dois planos, duas vigências e um dia sem registro uniforme é uma spec de ~20 linhas hoje, contra
as ~300 que custava antes. O argumento "o teste é caro" deixou de ser válido; o que sustenta
este ADR agora é só a falta de decisão de produto sobre número histórico, não o custo de
verificar.
