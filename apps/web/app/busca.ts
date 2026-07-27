"use server";

// A BUSCA de alimentos, do lado do servidor.
//
// Por que uma Server Action e não `fetch` do navegador: `GET /nutri/foods` exige
// `x-nutri-key`, e a chave não pode sair do servidor (ver `lib/nutri.ts`). A
// ação é a única forma de o seletor de alimento consultar o catálogo sem que a
// credencial atravesse — e não precisa de rota nova nem de plumbing de fetch.
//
// A régua da relevância é a da API (`@bamboo/core/fuzzy`, 019): subsequência
// pontuada, insensível a acento, com prêmio por casamento colado e em início de
// palavra. Nada de ordenar de novo aqui — duas cópias de uma ordenação divergem
// no primeiro ajuste e o mesmo termo passa a dar ordens diferentes por tela.

import type { FoodDto } from "@bamboo/types";
import { searchFoods } from "../lib/nutri";

// Uma página. 20 é o mesmo tamanho da lista de troca do paciente (019).
//
// Não é exportado: num arquivo `"use server"` só funções async podem sair, e o
// seletor não precisa do número — quantos faltam ele calcula de `total`.
const PAGINA = 20;

export type PaginaDeAlimentos = {
  readonly foods: ReadonlyArray<FoodDto>;
  /** Quantos casaram no total — é o que diz se ainda há página. */
  readonly total: number;
  /** Falhou? A tela precisa dizer isso sem ficar num "carregando" eterno. */
  readonly erro: boolean;
};

export async function buscarAlimentos(
  q: string,
  offset: number,
): Promise<PaginaDeAlimentos> {
  try {
    const r = await searchFoods(q, PAGINA, Math.max(0, offset));
    return { foods: r.foods, total: r.total, erro: false };
  } catch {
    // A ação não lança: um throw aqui viraria erro não tratado no cliente, e o
    // seletor perderia até o que já estava na lista.
    return { foods: [], total: 0, erro: true };
  }
}
