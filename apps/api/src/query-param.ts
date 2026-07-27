// Leitura de parâmetro de query — a mesma regra em todo endpoint paginado.
//
// TOLERANTE de propósito: `?offset=abc` cai no default em vez de 400. Uma tela
// que não abre porque o cliente mandou lixo num parâmetro opcional é pior que a
// mesma tela na primeira página. Validação estrita fica para o que é obrigatório.

export function inteiroDeQuery(
  v: unknown,
  padrao: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min) return padrao;
  return Math.min(Math.floor(n), max);
}
