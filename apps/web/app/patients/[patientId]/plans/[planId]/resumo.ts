// O SUMÁRIO NUTRICIONAL do tipo-de-dia exibido: kcal, proteína, carboidrato,
// gordura, fibra e sódio.
//
// Sem JSX de propósito, como o `diff.ts`: é o pedaço com decisão, e num `.ts` ele
// roda no Vitest (o `jsx: preserve` do Next impede o esbuild do Vitest de ler um
// `.tsx`).
//
// A UNIDADE é o tipo-de-dia, não o plano: um plano é um CONJUNTO de tipos-de-dia
// (treino, descanso) com alvos diferentes de propósito, então "as kcal do plano"
// não é um número — somar dia de treino com dia de descanso não descreve dia
// nenhum. A tela já mostra um tipo-de-dia por vez; o sumário acompanha.
//
// O que entra: a opção PADRÃO de cada refeição. É a mesma definição de "o dia
// planejado" que o motor de rebalanceamento usa (`alvoDoDia` em `@bamboo/core`):
// as outras opções são alternativas para o mesmo lugar, e somá-las contaria a
// refeição duas ou três vezes.
//
// DUAS entradas para a MESMA soma, e é de propósito:
//  · `resumoDoTipoDia` lê o DTO — o plano como está GRAVADO (modo leitura, e o
//    valor inicial do modo de edição, que assim já vem certo no HTML).
//  · `resumoDoFormulario` lê o DOM — o plano como o formulário está AGORA,
//    incluindo o que ainda não foi salvo (gramas digitadas, alimento trocado,
//    linha marcada para excluir, item novo pendente).
// A matemática é uma só (`somar`); o que difere é a seleção — "está gravado"
// contra "está pendente" são perguntas diferentes, e a segunda não existe no DTO.

import type { MacrosPer100gDto, PlanoTipoDiaDto } from "@bamboo/types";

/**
 * `semFibra`/`semSodio` = quantos itens COM gramas não têm o dado na base.
 *
 * A base tem fibra e sódio nullable (alimento cadastrado à mão não os traz), e
 * somar `null` como zero é a tela mentindo com número certo: "12 g de fibra"
 * quando 3 dos 8 alimentos não têm o dado é menor que o real e parece exato.
 * Quem exibe mostra o total E quantos ficaram de fora. Item de 0 g (à vontade)
 * não conta: ele contribuiria zero de qualquer forma.
 */
export interface Resumo {
  readonly kcal: number;
  readonly protein: number;
  readonly carb: number;
  readonly fat: number;
  readonly fiber: number;
  /** Miligramas. */
  readonly sodium: number;
  readonly semFibra: number;
  readonly semSodio: number;
  /** Itens que entraram na conta (com gramas > 0). */
  readonly itens: number;
}

export const RESUMO_ZERO: Resumo = {
  kcal: 0,
  protein: 0,
  carb: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
  semFibra: 0,
  semSodio: 0,
  itens: 0,
};

export interface Aporte {
  readonly macros: MacrosPer100gDto;
  readonly gramas: number;
}

/** Σ (gramas/100 × por-100g). Regra de três, a mesma de `nutrientesDaPorcao`. */
export function somar(aportes: ReadonlyArray<Aporte>): Resumo {
  return aportes.reduce<Resumo>((acc, { macros: m, gramas }) => {
    if (!(gramas > 0)) return acc;
    const f = gramas / 100;
    return {
      kcal: acc.kcal + m.kcalPer100g * f,
      protein: acc.protein + m.proteinPer100g * f,
      carb: acc.carb + m.carbPer100g * f,
      fat: acc.fat + m.fatPer100g * f,
      fiber: acc.fiber + (m.fiberPer100g ?? 0) * f,
      sodium: acc.sodium + (m.sodiumMgPer100g ?? 0) * f,
      semFibra: acc.semFibra + (m.fiberPer100g === null ? 1 : 0),
      semSodio: acc.semSodio + (m.sodiumMgPer100g === null ? 1 : 0),
      itens: acc.itens + 1,
    };
  }, RESUMO_ZERO);
}

/* ═══════════ do DTO (o plano gravado) ═══════════ */

export function resumoDoTipoDia(tipo: PlanoTipoDiaDto | undefined): Resumo {
  if (!tipo) return RESUMO_ZERO;
  return somar(
    tipo.meals.flatMap((m) => {
      const padrao = m.options.find((o) => o.isDefault);
      if (!padrao) return [];
      // Item à vontade tem `quantityGrams` 0 (018) e cai fora em `somar`.
      return padrao.items.map((i) => ({
        macros: i.macros,
        gramas: i.quantityGrams,
      }));
    }),
  );
}

/* ═══════════ do DOM (o formulário como está agora) ═══════════ */

/**
 * Os macros viajam num `data-macros` de seis campos na ordem fixa
 * `kcal|carb|prot|gord|fibra|sódio`, vazio onde é `null`.
 *
 * Par escrever/ler no mesmo módulo de propósito: é o único acoplamento entre o
 * servidor que renderiza e o navegador que soma, e separá-los em dois arquivos
 * é como um ganha um campo e o outro não. JSON num atributo resolveria o mesmo
 * problema com escape de aspas no HTML — o pipe é o que `lote.ts` já usa.
 */
export function macrosParaAtributo(m: MacrosPer100gDto): string {
  return [
    m.kcalPer100g,
    m.carbPer100g,
    m.proteinPer100g,
    m.fatPer100g,
    m.fiberPer100g ?? "",
    m.sodiumMgPer100g ?? "",
  ].join("|");
}

/** `null` = atributo ausente ou fora de forma: o item não entra na conta em vez
 *  de entrar com zeros, que baixaria o total calado. */
export function macrosDeAtributo(
  bruto: string | null,
): MacrosPer100gDto | null {
  if (bruto === null) return null;
  const p = bruto.split("|");
  if (p.length !== 6) return null;
  // `Number("")` é 0, não NaN: o campo em branco tem de ser tratado ANTES da
  // conversão, senão um kcal ausente entraria na conta como zero.
  const n = (i: number): number | null => {
    const c = p[i];
    if (c === undefined || c === "") return null;
    const v = Number(c);
    return Number.isFinite(v) ? v : null;
  };
  const [kcal, carb, prot, gord] = [n(0), n(1), n(2), n(3)];
  if (kcal === null || carb === null || prot === null || gord === null)
    return null;
  return {
    kcalPer100g: kcal,
    carbPer100g: carb,
    proteinPer100g: prot,
    fatPer100g: gord,
    fiberPer100g: n(4),
    sodiumMgPer100g: n(5),
  };
}

/** Marcado para excluir no salvar? O prefixo do `value` (`item:`, `opcao:`,
 *  `refeicao:`) é o que distingue o meu do dos filhos — a marcação de um item
 *  vive DENTRO da opção, e sem o prefixo excluir um item apagaria a opção da
 *  conta. */
function marcado(el: Element, prefixo: string): boolean {
  const cx = el.querySelector<HTMLInputElement>(
    `input[data-remover][value^="${prefixo}"]`,
  );
  return cx?.checked === true;
}

/** As gramas efetivas de uma linha: "à vontade" marcado zera o número, que é o
 *  que a ação manda e o que a API grava. */
function gramas(linha: Element): number {
  const campo = linha.querySelector<HTMLInputElement>("[data-quantidade]");
  if (!campo) return 0;
  const aVontade = campo.parentElement?.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (aVontade?.checked) return 0;
  const n = Number(campo.value.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Só a opção PADRÃO entra, e "padrão" aqui é o rádio MARCADO — não o que estava
 * gravado: marcar outra opção como padrão troca o dia inteiro, e é a mudança
 * que mais move os números.
 *
 * Opção NOVA (ainda não salva) não tem rádio e por isso não tem `data-opcao`:
 * ela nasce não-padrão, então não entra na conta nem por acidente. Refeição nova
 * também não — ela nasce sem alimento nenhum.
 */
export function resumoDoFormulario(raiz: ParentNode): Resumo {
  const aportes: Aporte[] = [];
  for (const opcao of Array.from(raiz.querySelectorAll("[data-opcao]"))) {
    const radio = opcao.querySelector<HTMLInputElement>(
      'input[type="radio"][data-padrao]',
    );
    if (radio?.checked !== true) continue;
    if (marcado(opcao, "opcao:")) continue;
    const refeicao = opcao.closest("[data-refeicao]");
    if (refeicao && marcado(refeicao, "refeicao:")) continue;

    for (const linha of Array.from(opcao.querySelectorAll("[data-item]"))) {
      if (marcado(linha, "item:")) continue;
      const macros = macrosDeAtributo(
        linha.querySelector("[data-macros]")?.getAttribute("data-macros") as
          | string
          | null,
      );
      if (!macros) continue;
      aportes.push({ macros, gramas: gramas(linha) });
    }
  }
  return somar(aportes);
}

/** Dois resumos com os mesmos números. Existe porque quem observa o formulário
 *  observa a si mesmo: a faixa do sumário vive DENTRO do `<form>`, então
 *  redesenhá-la é uma mutação que dispararia outro recálculo. Devolvendo o
 *  estado anterior quando nada mudou, o React não redesenha e o ciclo termina. */
export function mesmoResumo(a: Resumo, b: Resumo): boolean {
  return (Object.keys(a) as ReadonlyArray<keyof Resumo>).every(
    (k) => a[k] === b[k],
  );
}

/* ═══════════ exibição ═══════════ */

const nf = (casas: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

/** kcal e sódio em inteiro (a casa decimal ali é ruído); macros com uma casa. */
export const numero = (valor: number, casas: number): string =>
  nf(casas).format(valor);
