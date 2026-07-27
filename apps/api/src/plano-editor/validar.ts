// Validação ESTRUTURAL de borda do editor de plano (017 / FR-006).
//
// Por que não `class-validator`: o repo não tem `ValidationPipe` instalado e
// valida no padrão `typeof`/`trim` (ver `patients.service.ts` da 016 e
// `ciclo.controller.ts`). Trazer a dependência para validar strings e números
// seria inconsistente com o que já existe — e estes helpers cabem em 100 linhas.
//
// Estrutural ≠ de negócio: aqui só entra o que se decide olhando o payload.
// Pertinência ao plano, vínculo alimento↔grupo e uso por registro dependem do
// banco e vivem no service, respondendo 422/409 (FR-007).
import { BadRequestException } from '@nestjs/common';

/**
 * A chave existe no corpo? Num PATCH parcial, "não mandou o campo" (preserva) e
 * "mandou `null`" (limpa) são intenções diferentes — e `body.x === undefined`
 * não as distingue. Só a presença da chave distingue (D7).
 *
 * `hasOwnProperty` via `call`: `{}.toString` existe pelo prototype e não é
 * campo mandado por ninguém.
 */
export function presente(corpo: unknown, campo: string): boolean {
  return (
    typeof corpo === 'object' &&
    corpo !== null &&
    Object.prototype.hasOwnProperty.call(corpo, campo)
  );
}

/** Texto obrigatório, aparado. `max` é sanidade de borda, não regra de negócio. */
export function texto(v: unknown, campo: string, max = 120): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length === 0 || s.length > max) {
    throw new BadRequestException(
      `${campo} é obrigatório: texto de 1 a ${max} caracteres`,
    );
  }
  return s;
}

/** Texto opcional: `null` limpa o campo, texto vazio também (ninguém guarda ''). */
export function textoOuNulo(
  v: unknown,
  campo: string,
  max = 120,
): string | null {
  if (v === null) return null;
  if (typeof v === 'string' && v.trim().length === 0) return null;
  return texto(v, campo, max);
}

function numero(v: unknown, campo: string, max: number, min: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new BadRequestException(
      `${campo} deve ser um número entre ${min} e ${max}`,
    );
  }
  return v;
}

/** Estritamente > 0. Gramas, porção de referência, peso, altura. */
export function numeroPositivo(v: unknown, campo: string, max = 1e6): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) {
    throw new BadRequestException(
      `${campo} deve ser um número maior que 0 e até ${max}`,
    );
  }
  return v;
}

/** ≥ 0. Nutriente por 100 g: água tem 0 kcal e a maioria da tabela tem 0 g de gordura. */
export function numeroNaoNegativo(
  v: unknown,
  campo: string,
  max = 1e6,
): number {
  return numero(v, campo, max, 0);
}

export function numeroPositivoOuNulo(
  v: unknown,
  campo: string,
  max = 1e6,
): number | null {
  return v === null ? null : numeroPositivo(v, campo, max);
}

export function inteiroEntre(
  v: unknown,
  campo: string,
  min: number,
  max: number,
): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new BadRequestException(
      `${campo} deve ser um inteiro entre ${min} e ${max}`,
    );
  }
  return v;
}

export function umDe<T extends string>(
  v: unknown,
  campo: string,
  valores: ReadonlyArray<T>,
): T {
  if (
    typeof v !== 'string' ||
    !(valores as ReadonlyArray<string>).includes(v)
  ) {
    throw new BadRequestException(
      `${campo} deve ser um de: ${valores.join(', ')}`,
    );
  }
  return v as T;
}

export function booleano(v: unknown, campo: string): boolean {
  if (typeof v !== 'boolean') {
    throw new BadRequestException(`${campo} deve ser true ou false`);
  }
  return v;
}

/**
 * Horário informativo da refeição (coluna `time`). Normaliza para `HH:MM:SS`
 * porque é o que o Postgres devolve na leitura — sem isso, o valor que entra e
 * o que sai têm formatos diferentes e a tela pisca.
 */
export function horario(v: unknown, campo: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') {
    throw new BadRequestException(`${campo} deve ser HH:MM ou HH:MM:SS`);
  }
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(v.trim());
  if (!m) {
    throw new BadRequestException(
      `${campo} deve ser HH:MM ou HH:MM:SS, com hora 00–23 e minuto 00–59`,
    );
  }
  return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
}
