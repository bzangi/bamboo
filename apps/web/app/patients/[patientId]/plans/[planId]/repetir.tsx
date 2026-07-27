"use client";

// LINHAS QUE SE REPETEM: o "+" que põe outra cópia dos mesmos campos embaixo, e
// a lixeirinha que tira a cópia de volta.
//
// A linha em branco continua vindo do SERVIDOR — este componente só a CLONA. É
// o que evita mandar os ~590 alimentos para o JavaScript: o `<select>` do
// catálogo já está no HTML, e clonar o nó traz as opções junto de graça. Passar
// a lista como prop de componente client a colocaria também no payload do
// React, duplicando o maior pedaço da página.
//
// O clique é DELEGADO no contêiner, não pendurado nos botões: da 2ª linha em
// diante os botões são nós clonados, sem handler de React nenhum. Delegar é o
// que faz o clone funcionar sem manter um espelho do DOM no estado do React.
//
// Sem JavaScript os dois botões não fazem nada e a primeira linha continua
// salvando normalmente — uma adição por salvar em vez de várias.
//
// A mecânica (clonar, apagar, renumerar) mora em `repetir-dom.ts`, onde tem
// teste.

import { useRef, type ReactNode } from "react";
import { adicionarLinha, removerLinha } from "./repetir-dom";

export function LinhasRepetiveis({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={caixa}
      className={className}
      onClick={(e) => {
        const raiz = caixa.current;
        if (!raiz) return;
        const alvo = e.target as HTMLElement;

        // Um bloco pode estar DENTRO de outro (os alimentos de uma opção nova
        // dentro da linha da opção). Sem parar a propagação, o clique no "+" de
        // dentro dispararia também o de fora e clonaria a opção inteira.
        const mais = alvo.closest("[data-mais]");
        if (mais) {
          e.stopPropagation();
          adicionarLinha(raiz)
            ?.querySelector<HTMLElement>("select, input:not([type=checkbox])")
            ?.focus();
          return;
        }
        const menos = alvo.closest("[data-menos]");
        if (menos) {
          e.stopPropagation();
          removerLinha(raiz, menos);
        }
      }}
    >
      {children}
    </div>
  );
}
