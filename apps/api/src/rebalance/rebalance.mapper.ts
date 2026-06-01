// Mapeamento PURO: RebalanceOutcome (núcleo) -> OptionChoiceResponse (DTO).
// Aplica o gate de exposição no totalDepois (ação, não número de culpa).
// Sem I/O, sem throw, sem mutação. Princípio III.
import { match } from 'ts-pattern';
import type { Nutrientes, RebalanceOutcome } from '@bamboo/core';
import type {
  ExposureLevel,
  OptionChoiceResponse,
  RebalanceOutcomeDto,
  RefeicaoAfetadaDto,
  TotalDepoisDto,
} from '@bamboo/types';

export interface MealRef {
  readonly id: string;
  readonly name: string;
}
export interface FoodRef {
  readonly id: string;
  readonly name: string;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

// Mensagem de orientação (ação, não erro) por motivo de recusa.
function mensagemRecusa(motivo: 'estoura-piso' | 'sem-alavanca'): string {
  return motivo === 'estoura-piso'
    ? 'Hoje passou do planejado — segue mais leve no resto do dia e a gente reequilibra amanhã.'
    : 'Não dá pra ajustar as próximas refeições sem mexer no que está travado — segue o plano e volta amanhã.';
}

// Total do dia filtrado pela exposição: ausente em hidden/percent; macros em
// macros; tudo em full_kcal. (FR-023/FR-024 — nunca % de caloria.)
function totalDepoisFor(
  total: Nutrientes,
  exposure: ExposureLevel,
): TotalDepoisDto | undefined {
  if (exposure === 'hidden' || exposure === 'percent') return undefined;
  const macros: TotalDepoisDto = {
    carb: round1(total.carb),
    protein: round1(total.protein),
    fat: round1(total.fat),
  };
  if (exposure === 'macros') return macros;
  return { ...macros, kcal: Math.round(total.kcal) };
}

export function toOptionChoiceResponse(input: {
  readonly patientId: string;
  readonly exposure: ExposureLevel;
  readonly outcome: RebalanceOutcome;
  readonly mealByPosition: ReadonlyMap<number, MealRef>;
  readonly foodByItemId: ReadonlyMap<string, FoodRef>;
}): OptionChoiceResponse {
  const { patientId, exposure, outcome, mealByPosition, foodByItemId } = input;

  const dto: RebalanceOutcomeDto = match(outcome)
    .with({ kind: 'sem-acao' }, () => ({ kind: 'sem-acao' as const }))
    .with({ kind: 'recusa-orientada' }, (o) => ({
      kind: 'recusa-orientada' as const,
      motivo: o.motivo,
      mensagem: mensagemRecusa(o.motivo),
    }))
    .with({ kind: 'rebalanceado' }, (o) => {
      // Agrupa as alavancas ajustadas por refeição (position).
      const porPosicao = new Map<number, RefeicaoAfetadaDto>();
      for (const a of o.alavancas) {
        const meal = mealByPosition.get(a.refeicaoPosition);
        const food = foodByItemId.get(a.itemId);
        if (!meal || !food) continue; // defensivo; não deve ocorrer
        const existente = porPosicao.get(a.refeicaoPosition);
        const item = {
          itemId: a.itemId,
          food,
          gramasNovo: round1(a.gramasNovo),
          medidaCaseira: a.medidaCaseira
            ? { label: a.medidaCaseira.label, grams: a.medidaCaseira.grams }
            : null,
        };
        if (existente) {
          porPosicao.set(a.refeicaoPosition, {
            ...existente,
            itensAjustados: [...existente.itensAjustados, item],
          });
        } else {
          porPosicao.set(a.refeicaoPosition, {
            mealId: meal.id,
            name: meal.name,
            position: a.refeicaoPosition,
            itensAjustados: [item],
          });
        }
      }
      const refeicoesAfetadas = [...porPosicao.values()].sort(
        (x, y) => x.position - y.position,
      );
      const totalDepois = totalDepoisFor(o.totalDepois, exposure);
      return {
        kind: 'rebalanceado' as const,
        refeicoesAfetadas,
        ...(totalDepois ? { totalDepois } : {}),
      };
    })
    .exhaustive();

  return { patientId, exposure, outcome: dto };
}
