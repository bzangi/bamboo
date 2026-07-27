// A régua de busca por nome — a MESMA no app do paciente e na busca do catálogo
// da nutri. Duas cópias de uma ordenação divergem no primeiro ajuste, e aí o
// mesmo termo passa a devolver ordens diferentes nas duas telas.
//
// "Fuzzy" aqui é SUBSEQUÊNCIA pontuada (a semântica de fzf/VSCode): os caracteres
// do termo aparecem no nome, na ordem, não necessariamente juntos. "arrint" acha
// "Arroz integral"; "acai" acha "Açaí" porque a comparação dobra o acento.
//
// ponytail: sem tolerância a ERRO de digitação — "arros" não acha "arroz". Isso
// pede distância de edição (Levenshtein/trigrama) e um limiar para calibrar, e
// afrouxar a subsequência só produziria ruído. Quando aparecer reclamação de
// typo, o passo é `pg_trgm` no servidor + um scorer com distância aqui.

/** Vogais acentuadas do português e a dobra correspondente. É EXATAMENTE a mesma
 *  tabela do `translate` em SQL (`catalogo.service`): se as duas divergirem, o
 *  pré-filtro do banco e a pontuação daqui passam a discordar sobre o que casa. */
const ACENTUADAS = "áàâãäéèêëíìîïóòôõöúùûüç";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuuc";

/** Caracteres que iniciam palavra no que vem depois deles. */
const SEPARADORES = " -,./()";

/** Caixa baixa + acento dobrado. Não escapa nada: escape de curinga é assunto de
 *  quem monta padrão SQL, não da régua de comparação. */
export function normalizarBusca(s: string): string {
  return s.toLowerCase().replace(/./gu, (c) => {
    const i = ACENTUADAS.indexOf(c);
    return i === -1 ? c : SEM_ACENTO[i]!;
  });
}

/** O termo como sequência de caracteres a casar: sem acento, sem caixa e sem
 *  espaço — o nome pode separar com hífen ("Arroz-integral") e o paciente não
 *  tem como adivinhar isso. */
export function caracteresDoTermo(termo: string): string {
  return normalizarBusca(termo).replace(/\s+/g, "");
}

/**
 * Quão bem `termo` casa com `texto`. `null` = não casa. Maior é melhor; a escala
 * não significa nada fora da comparação entre candidatos do mesmo termo.
 *
 * O casamento é guloso pela esquerda — o que para EXISTÊNCIA de subsequência é
 * ótimo (se existe casamento, o guloso acha). Só a pontuação fica subótima, e
 * pontuação subótima reordena; não esconde resultado.
 */
export function pontuarFuzzy(termo: string, texto: string): number | null {
  const chars = caracteresDoTermo(termo);
  if (chars.length === 0) return 0;

  const alvo = normalizarBusca(texto);
  let pontos = 0;
  let cursor = 0;

  for (const c of chars) {
    const at = alvo.indexOf(c, cursor);
    if (at === -1) return null;

    pontos += 1;
    if (at === 0 || SEPARADORES.includes(alvo[at - 1]!)) pontos += 3; // início de palavra
    // Casar em `cursor` é o mesmo que casar colado no caractere anterior — daí
    // o prêmio e a punição serem os dois lados do MESMO teste.
    pontos += at === cursor ? 4 : -Math.min(at - cursor, 3);

    cursor = at + 1;
  }
  return pontos;
}

/**
 * Filtra e ordena por relevância. **Estável**: empate preserva a ordem recebida —
 * o desempate é do chamador, que passa a lista já ordenada como quiser (a casca
 * do catálogo passa ordenada por `(name, id)`).
 */
export function buscarFuzzy<T>(
  itens: readonly T[],
  termo: string,
  rotulo: (item: T) => string,
): readonly T[] {
  if (caracteresDoTermo(termo).length === 0) return itens;

  return itens
    .flatMap((item, i) => {
      const pontos = pontuarFuzzy(termo, rotulo(item));
      return pontos === null ? [] : [{ item, pontos, i }];
    })
    .sort((a, b) => b.pontos - a.pontos || a.i - b.i)
    .map((x) => x.item);
}
