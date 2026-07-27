// 021: busca+paginação de alternativas extraída do SubstitutionSheet (019) para
// ser reutilizada pelo CombineSheet — a MESMA semântica de debounce/guarda de
// geração/fim-de-página nos dois lugares, para não divergir num ajuste futuro
// (mesmo motivo, aplicado ao fuzzy.ts, de manter uma régua só).
import { useEffect, useRef, useState } from "react";
import { getSubstitutions } from "@bamboo/api-client";
import type { MealItemDto, SubstitutionsResponse } from "@bamboo/types";
import { API_URL } from "./config";
import { log } from "./logger";

export type AlternativesLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      // `data.alternatives` ACUMULA as páginas já recebidas.
      readonly data: SubstitutionsResponse;
      readonly fim: boolean;
      readonly carregandoMais: boolean;
    };

/** Abaixo disto o campo de busca é ruído: a lista inteira já cabe na tela. */
export const MINIMO_PARA_BUSCAR = 8;

/** Espera de digitação antes de consultar o servidor. */
const DEBOUNCE_MS = 250;

/** Itens por página. */
const PAGINA = 20;

/**
 * Fim da lista = página que voltou com menos itens que o pedido. O endpoint não
 * devolve total: quando o grupo tem múltiplo exato de `PAGINA`, sobra uma
 * requisição que volta vazia e encerra — mais barato que um campo de total em
 * toda resposta.
 */
const fimDaLista = (recebidos: number) => recebidos < PAGINA;

/**
 * Busca fuzzy + paginação sobre as alternativas de um item flexível.
 * `includeSelf` (021) pede que o próprio food do item entre na lista — uso do
 * combinar, que quer poder oferecê-lo como um dos dois alvos.
 */
export function useAlternativesSearch(
  item: MealItemDto | null,
  opts: { readonly includeSelf?: boolean } = {},
) {
  const { includeSelf } = opts;
  const [state, setState] = useState<AlternativesLoadState>({
    status: "loading",
  });
  const [termo, setTermo] = useState("");
  // O termo já "assentado" — é ele que vai à rede, não cada tecla.
  const [busca, setBusca] = useState("");
  // Cada primeira página é uma geração nova; página seguinte que chegar de uma
  // geração velha (o usuário digitou no meio do caminho) é descartada.
  const geracao = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setBusca(termo), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo]);

  // O sheet não desmonta entre aberturas: sem isto a busca da troca anterior
  // continuaria valendo para o item novo. Zerar DURANTE O RENDER (padrão do
  // "You Might Not Need an Effect") e não num `useEffect`: em efeito, o fetch
  // abaixo dispararia uma vez com o termo velho antes de o reset chegar.
  const [itemAnterior, setItemAnterior] = useState(item);
  if (item !== itemAnterior) {
    setItemAnterior(item);
    setTermo("");
    setBusca("");
  }

  useEffect(() => {
    if (!item) return;
    const minha = ++geracao.current;
    setState({ status: "loading" });

    getSubstitutions(API_URL, item.id, { q: busca, limit: PAGINA, includeSelf })
      .then((data) => {
        if (geracao.current !== minha) return;
        setState({
          status: "ready",
          data,
          fim: fimDaLista(data.alternatives.length),
          carregandoMais: false,
        });
      })
      .catch((e: unknown) => {
        log.error(
          "useAlternativesSearch",
          `falha ao buscar alternativas item=${item.id}`,
          e,
        );
        if (geracao.current !== minha) return;
        const message =
          e instanceof Error ? e.message : "Falha ao buscar alternativas.";
        setState({ status: "error", message });
      });
  }, [item, busca, includeSelf]);

  function carregarMais() {
    if (!item || state.status !== "ready") return;
    if (state.fim || state.carregandoMais) return;

    const minha = geracao.current;
    const jaTem = state.data.alternatives.length;
    setState({ ...state, carregandoMais: true });

    getSubstitutions(API_URL, item.id, {
      q: busca,
      limit: PAGINA,
      offset: jaTem,
      includeSelf,
    })
      .then((pagina) => {
        if (geracao.current !== minha) return;
        setState((atual) =>
          atual.status === "ready"
            ? {
                ...atual,
                data: {
                  ...atual.data,
                  alternatives: [
                    ...atual.data.alternatives,
                    ...pagina.alternatives,
                  ],
                },
                fim: fimDaLista(pagina.alternatives.length),
                carregandoMais: false,
              }
            : atual,
        );
      })
      .catch((e: unknown) => {
        log.error(
          "useAlternativesSearch",
          `falha na página offset=${jaTem}`,
          e,
        );
        if (geracao.current !== minha) return;
        // Falha de página NÃO derruba o que já está na tela: só para de crescer.
        setState((atual) =>
          atual.status === "ready"
            ? { ...atual, fim: true, carregandoMais: false }
            : atual,
        );
      });
  }

  return {
    state,
    termo,
    setTermo,
    /** Há termo valendo na consulta atual — muda o texto do estado vazio. */
    buscando: busca.length > 0,
    carregarMais,
  };
}
