"use client";

// O MODAL de revisão: lista o que o formulário vai mudar no plano antes de
// qualquer escrita.
//
// ⚠️ Esta é a ÚNICA ilha client do app da nutri, e é uma decisão consciente: um
// diff do que está DIGITADO só existe no navegador — o servidor não sabe o que
// foi tecleado até o submit, então não há versão zero-JS disto (a alternativa
// seria um segundo POST devolvendo uma tela de conferência com o formulário
// inteiro em campos ocultos: mais máquina e uma tela a mais).
//
// A garantia que importa NÃO muda: este arquivo não importa `lib/nutri` nem as
// ações, não recebe segredo por prop e não faz fetch. A `NUTRI_API_KEY` segue
// existindo só no servidor, e a escrita continua sendo a mesma Server Action.
//
// E degrada: sem JavaScript o `onClick` nunca roda, o botão é `type="submit"` de
// verdade e o formulário salva direto — sem revisão, mas sem quebrar.

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { diff, type Mudanca } from "./diff";

function Linha({ m }: { m: Mudanca }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0">
      <span className="text-xs tracking-wide text-subtle uppercase">
        {m.rotulo}
      </span>
      {m.de === null ? (
        <span className="text-sm text-[var(--feito)]">+ {m.para}</span>
      ) : m.para === null ? (
        <span className="text-sm text-destructive line-through">{m.de}</span>
      ) : (
        <span className="text-sm text-foreground">
          {/* Campo que estava vazio (horário, semana não programada) vira um
              travessão: "→ 20:00" sozinho parece linha cortada pela metade. */}
          <span className="text-muted-foreground line-through">
            {m.de === "" ? "—" : m.de}
          </span>
          <span aria-hidden="true" className="text-subtle">
            {" → "}
          </span>
          {m.para}
        </span>
      )}
    </li>
  );
}

/**
 * O botão único do formulário — e a revisão que ele abre.
 *
 * Ordem que importa: `reportValidity()` ANTES do modal. Sem isso a nutri
 * confirmaria uma lista de mudanças que o navegador vai recusar em seguida, e o
 * balão de validação aparece atrás do modal.
 */
export function SalvarComRevisao() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [mudancas, setMudancas] = useState<ReadonlyArray<Mudanca>>([]);

  return (
    <>
      <Button
        type="submit"
        onClick={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          e.preventDefault();
          if (!form.reportValidity()) return;
          setMudancas(diff(form));
          dialogo.current?.showModal();
        }}
      >
        Salvar alterações
      </Button>

      <dialog
        ref={dialogo}
        aria-label="Confirmar alterações do plano"
        className="m-auto w-[min(38rem,92vw)] rounded-md border border-border bg-card p-0 text-foreground shadow-[var(--shadow-2)] backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-1 border-b border-border px-5 py-4">
          <h2 className="font-display text-[0.9375rem] font-medium text-foreground">
            Confirmar alterações
          </h2>
          <p className="text-sm text-muted-foreground">
            {mudancas.length === 0
              ? "Nada mudou neste formulário."
              : `${mudancas.length} ${mudancas.length === 1 ? "alteração será aplicada" : "alterações serão aplicadas"} ao plano.`}
          </p>
        </div>

        {mudancas.length > 0 && (
          <ul className="max-h-[50vh] overflow-y-auto px-5 py-1">
            {mudancas.map((m, i) => (
              <Linha key={`${m.rotulo}-${i}`} m={m} />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
          <Button type="submit" disabled={mudancas.length === 0}>
            Confirmar e salvar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dialogo.current?.close()}
          >
            Voltar e editar
          </Button>
        </div>
      </dialog>
    </>
  );
}
