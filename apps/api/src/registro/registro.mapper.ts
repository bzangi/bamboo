// Mapeamento PURO: estado vigente (núcleo) + "o agora" -> RegistroResponse (DTO).
// Sem I/O, sem throw, sem mutação; entradas readonly. Princípio III.
// Nunca serializa entidade Drizzle crua nem expõe número (FR-016): a casca
// resolve tudo e passa só o estado vigente do core + o OAgora re-derivado.
import type { EstadoRegistro, OAgora } from '@bamboo/core';
import type { RegistroResponse } from '@bamboo/types';

export function toRegistroResponse(input: {
  readonly mealId: string;
  readonly loggedDate: string;
  readonly vigente: EstadoRegistro | null;
  readonly oAgora: OAgora;
}): RegistroResponse {
  const { mealId, loggedDate, vigente, oAgora } = input;
  return {
    mealId,
    loggedDate,
    vigente: vigente === null ? null : { state: vigente },
    currentMealId: oAgora.kind === 'refeicao' ? oAgora.mealId : null,
    diaConcluido: oAgora.kind === 'dia-concluido',
  };
}
