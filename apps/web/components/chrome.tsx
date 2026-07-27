import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { frase } from "@/lib/erros";
import { cn } from "@/lib/utils";

// O cromo das telas da nutri (017). Componentes de servidor puros: nenhum estado,
// nenhum evento, nada de "use client".

export function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      {children}
    </main>
  );
}

/** Migalha de pão: sempre dá o caminho de volta sem depender do histórico. */
export function Trilha({
  itens,
}: {
  itens: ReadonlyArray<{ href?: string; texto: string }>;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
      {itens.map((it, i) => (
        <React.Fragment key={`${it.texto}-${i}`}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.href ? (
            <Link
              className="hover:text-foreground hover:underline"
              href={it.href}
            >
              {it.texto}
            </Link>
          ) : (
            <span className="text-muted-foreground">{it.texto}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Cabecalho({
  sobrescrito,
  titulo,
  direita,
}: {
  sobrescrito: string;
  titulo: string;
  direita?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-subtle">
          {sobrescrito}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {titulo}
        </h1>
      </div>
      {direita}
    </header>
  );
}

/**
 * O aviso de falha de escrita. Recebe o CÓDIGO da URL e o traduz — nunca imprime
 * texto que veio de fora (ver `lib/erros.ts`). Código desconhecido cai na frase
 * genérica, então uma URL editada à mão não vira mensagem arbitrária na tela.
 */
export function Aviso({ codigo }: { codigo?: string }) {
  const texto = frase(codigo);
  if (!texto) return null;
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex flex-col gap-1">
        <CardTitle className="text-destructive">
          A alteração não foi feita
        </CardTitle>
        <p className="text-sm text-muted-foreground">{texto}</p>
      </CardContent>
    </Card>
  );
}

/** Falha de LEITURA: recebe TEXTO, nunca a exceção — passar uma instância de
 *  `Error` como prop explode a serialização do React Flight (lição da 015). */
export function Falha({
  titulo,
  detalhe,
}: {
  titulo: string;
  detalhe: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <CardTitle>{titulo}</CardTitle>
        <p className="text-sm text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

export function Vazio({
  titulo,
  children,
}: {
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-1">
        <CardTitle>{titulo}</CardTitle>
        {children && (
          <p className="text-sm text-muted-foreground">{children}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Texto em fonte mono — comando de terminal, id, número. */
export function Mono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-mono text-xs tabular-nums", className)}>
      {children}
    </span>
  );
}
