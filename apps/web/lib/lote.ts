// O contrato do SALVAR ÚNICO do editor de plano.
//
// O modo de edição manda um formulário inteiro e a ação (`app/acoes.ts`) escreve
// só o que MUDOU. A comparação é entre duas assinaturas: a que a tela renderizou
// num campo `orig.<chave>` e a que a ação remonta do FormData. Se as duas forem
// montadas em lugares diferentes, o primeiro ajuste em uma delas faz o lote ou
// mandar PATCH de tudo, ou — pior — deixar de mandar o que mudou. Daí morarem
// aqui, num lugar só, com teste.

/** `nome|posição|horário`. Horário nulo vira `null` literal — string vazia e
 *  "sem horário" não podem colidir. */
export const assinaturaRefeicao = (
  name: string,
  position: number,
  horario: string | null,
): string => `${name}|${position}|${horario ?? "null"}`;

/** `alimento|gramas|àvontade|flexibilidade`, onde flexibilidade é o valor do
 *  controle de três formas (vazio, `travado`, ou o id do grupo).
 *
 *  `adLibitum` entra na assinatura mesmo sendo redundante com gramas 0: marcar
 *  "à vontade" num item que já estava com 0 g é uma mudança real (a flag é o que
 *  distingue "0 porque à vontade" de "0 porque bug", 018) e sem ela esse salvar
 *  seria engolido. */
export const assinaturaItem = (
  foodId: string,
  quantityGrams: number,
  adLibitum: boolean,
  flex: string,
): string => `${foodId}|${quantityGrams}|${adLibitum}|${flex}`;

/** Os sete dias em ordem. A semana é UM objeto (017/D2), então a assinatura
 *  também é uma só. */
export const assinaturaSemana = (dayTypeIds: ReadonlyArray<string>): string =>
  dayTypeIds.join("|");

/**
 * Os ids presentes no formulário para um par (prefixo, sufixo):
 * `item.<id>.foodId` → `<id>`. É assim que o lote descobre o que veio na tela
 * sem reler o plano — e é o que faz `orig.item.<id>` NÃO ser confundido com
 * `item.<id>` (o prefixo casa no começo, não em qualquer posição).
 */
export function idsDe(
  chaves: Iterable<string>,
  prefixo: string,
  sufixo: string,
): string[] {
  const out: string[] = [];
  for (const k of chaves) {
    if (
      k.startsWith(prefixo) &&
      k.endsWith(sufixo) &&
      k.length > prefixo.length + sufixo.length
    )
      out.push(k.slice(prefixo.length, k.length - sufixo.length));
  }
  return out;
}
