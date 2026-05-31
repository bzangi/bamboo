// Result<T, E> — erro como valor. O núcleo nunca lança: retorna ok ou err.
// Implementado à mão (sem neverthrow/Effect/fp-ts) para manter o núcleo sem
// dependência de plataforma (roda no servidor e no device). Decisão D5.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
