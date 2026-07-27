"use client";

// O SELETOR DE ALIMENTO: campo de busca + lista paginada, no lugar do `<select>`
// com o catálogo inteiro.
//
// O que ele resolve: eram ~590 `<option>` por campo, repetidos em cada item da
// tela. Achar "batata doce" entre 590 era rolagem — o oposto de escolher num
// toque — e o HTML da página carregava o catálogo dezenas de vezes.
//
// A ordenação NÃO é feita aqui: quem ordena é a API, com a régua única do
// `@bamboo/core/fuzzy` (019). Duas cópias de uma ordenação divergem no primeiro
// ajuste, e o mesmo termo passaria a dar ordens diferentes na tela da nutri e na
// do paciente.
//
// O valor que o formulário envia é um `<input type="hidden">`: o `name` e o
// `data-*` continuam exatamente como eram com o `<select>`, então nem a ação nem
// o diff da revisão precisaram saber que este componente existe. O `data-valor`
// é o NOME escolhido — é o que a revisão mostra, porque um UUID no diff não diz
// nada a ninguém.
//
// Sem JavaScript o campo de busca não busca. O valor já gravado continua indo no
// hidden, então um salvar sem JS preserva o alimento do item em vez de apagá-lo.

import { useEffect, useRef, useState, useTransition } from "react";
import type { FoodDto, MacrosPer100gDto } from "@bamboo/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { buscarAlimentos } from "../../../../busca";
import { macrosParaAtributo } from "./resumo";

/** O que a nutri digita e o que ela vê são coisas diferentes: o termo filtra, o
 *  nome escolhido fica no campo até ela mexer de novo.
 *
 *  `macros` viaja junto porque é o que o sumário do dia soma: trocar o alimento
 *  muda as kcal na hora, sem ir ao servidor — e a busca já traz a composição. */
type Escolha = {
  readonly id: string;
  readonly nome: string;
  readonly macros: MacrosPer100gDto;
} | null;

const DEBOUNCE_MS = 250;

export function SeletorDeAlimento({
  name,
  inicial,
  rotulo,
  grupo,
  novo,
  obrigatorio,
  onEscolher,
}: {
  name: string;
  inicial?: { id: string; nome: string; macros: MacrosPer100gDto };
  /** Rótulo da mudança na revisão (`data-rotulo`). */
  rotulo?: string;
  grupo?: string;
  novo?: boolean;
  obrigatorio?: boolean;
  /** Avisa a linha se já há alimento — é o que libera o "+" dela. */
  onEscolher?: (temAlimento: boolean) => void;
}) {
  const [escolha, setEscolha] = useState<Escolha>(inicial ?? null);
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<ReadonlyArray<FoodDto>>([]);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState(false);
  const [carregando, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  // Guarda de geração: a resposta de um termo antigo que chega atrasada não pode
  // sobrescrever a lista do termo atual (mesma lição da 019 no app).
  const geracao = useRef(0);

  function pedir(q: string, offset: number) {
    const minha = ++geracao.current;
    iniciar(async () => {
      const r = await buscarAlimentos(q, offset);
      if (minha !== geracao.current) return;
      setErro(r.erro);
      setTotal(r.total);
      setLista((atual) => (offset === 0 ? r.foods : [...atual, ...r.foods]));
    });
  }

  // Debounce do termo. A primeira página vem quando a lista abre, não no
  // primeiro render de cada item: uma tela com 12 itens dispararia 12 buscas.
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => pedir(termo, 0), termo === "" ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo, aberto]);

  // Fechar ao clicar fora: sem isso a lista de um item fica aberta enquanto a
  // nutri edita outro, e duas listas abertas ao mesmo tempo confundem qual é qual.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const temMais = lista.length < total;

  return (
    <div ref={caixa} className="relative min-w-56 flex-1">
      <input
        type="hidden"
        name={name}
        value={escolha?.id ?? ""}
        data-rotulo={rotulo}
        data-orig={novo ? undefined : inicial?.nome}
        data-valor={escolha?.nome ?? ""}
        data-grupo={grupo}
        // Vazio sem escolha: o item entra na conta do sumário só quando há
        // alimento — zeros baixariam o total calado.
        data-macros={escolha ? macrosParaAtributo(escolha.macros) : ""}
      />
      {/* `required` num hidden não é validável pelo navegador; o campo visível
          carrega a obrigatoriedade e some da validação assim que há escolha. */}
      <Input
        type="text"
        value={aberto ? termo : (escolha?.nome ?? "")}
        placeholder="Buscar alimento…"
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-label="Alimento"
        required={obrigatorio && escolha === null}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setAberto(false);
            setTermo("");
          }
        }}
        className={cn("w-full", escolha === null && "text-subtle")}
      />

      {aberto && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-border bg-card shadow-[var(--shadow-2)]">
          {erro ? (
            <p className="px-3 py-2 text-sm text-destructive">
              Não foi possível buscar agora. Tente de novo.
            </p>
          ) : lista.length === 0 ? (
            <p className="px-3 py-2 text-sm text-subtle">
              {carregando
                ? "Buscando…"
                : termo === ""
                  ? "Digite para buscar."
                  : `Nenhum alimento com “${termo}”.`}
            </p>
          ) : (
            <ul role="listbox">
              {lista.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={f.id === escolha?.id}
                    onClick={() => {
                      setEscolha({ id: f.id, nome: f.name, macros: f });
                      onEscolher?.(true);
                      setAberto(false);
                      setTermo("");
                    }}
                    className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {temMais && (
            <button
              type="button"
              onClick={() => pedir(termo, lista.length)}
              disabled={carregando}
              className="w-full cursor-pointer border-t border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {carregando
                ? "Carregando…"
                : `carregar mais (${total - lista.length} de ${total} restantes)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
