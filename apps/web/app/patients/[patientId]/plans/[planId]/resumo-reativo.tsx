"use client";

// O sumário durante a EDIÇÃO: recalculado a cada tecla, sem ir ao servidor.
//
// Por que uma ilha client: o número que importa é o do plano que a nutri está
// montando AGORA — gramas digitadas, alimento trocado, linha marcada para
// excluir, opção padrão trocada. Nada disso existe no servidor até o salvar, e
// um sumário que só reflete o que já foi salvo é o número errado exatamente no
// momento em que ele é útil.
//
// Ela não recebe nem importa segredo nenhum: `inicial` é o total já renderizado
// pelo servidor (número puro), e o resto vem do DOM do próprio formulário.
//
// `inicial` também é a resposta ao caso sem JavaScript: a faixa aparece com o
// total do plano GRAVADO e simplesmente não se move.

import { useEffect, useRef, useState } from "react";
import { PainelResumo } from "./resumo-painel";
import { mesmoResumo, resumoDoFormulario, type Resumo } from "./resumo";

export function ResumoReativo({
  inicial,
  nomeDoTipo,
}: {
  inicial: Resumo;
  nomeDoTipo: string;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [resumo, setResumo] = useState(inicial);

  useEffect(() => {
    const form = ancora.current?.closest("form");
    if (!form) return;
    // Um listener no formulário, não um por campo: os campos nascem e morrem
    // (linha nova, linha descartada) e `input`/`change` sobem por bubbling — quem
    // se cadastrasse por campo perderia justamente os que aparecem depois.
    const recalcular = () => {
      const novo = resumoDoFormulario(form);
      setResumo((atual) => (mesmoResumo(atual, novo) ? atual : novo));
    };
    form.addEventListener("input", recalcular);
    form.addEventListener("change", recalcular);

    // O que NÃO chega por evento de formulário: escolher alimento no seletor (um
    // clique numa lista, que só reescreve o `data-macros` do campo oculto) e
    // acrescentar/descartar linha nova (estado do React, que só mexe no DOM).
    // Um observador cobre os dois SEM combinar nada com quem os provoca — e
    // dispara depois do commit, então já vê o DOM novo.
    const olho = new MutationObserver(recalcular);
    olho.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-macros"],
    });

    // No mount também: o navegador restaura valores digitados ao voltar para a
    // página, e aí o total do servidor já não descreve o formulário.
    recalcular();
    return () => {
      form.removeEventListener("input", recalcular);
      form.removeEventListener("change", recalcular);
      olho.disconnect();
    };
  }, []);

  return (
    <div
      ref={ancora}
      className="sticky top-0 z-10 -mx-1 bg-background px-1 py-2"
    >
      {/* z-10 e não mais: a lista do seletor de alimento é z-20 e precisa passar
          por cima desta faixa, senão escolher alimento fica atrás dela. */}
      <PainelResumo
        resumo={resumo}
        nomeDoTipo={nomeDoTipo}
        className="shadow-[var(--shadow-2)]"
      />
    </div>
  );
}
