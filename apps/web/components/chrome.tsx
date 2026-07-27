import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { frase } from "@/lib/erros";
import { cn } from "@/lib/utils";

// O cromo das telas da nutri (017). Componentes de servidor puros: nenhum estado,
// nenhum evento, nada de "use client".

export function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 pt-10 pb-24">
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
  /** Onde a pessoa está, quando o título sozinho não diz. Omitido na raiz: lá a
   *  barra da marca já diz "Bamboo · visão da nutri", e repetir é ruído. */
  sobrescrito?: string;
  titulo: string;
  direita?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
      <div>
        {sobrescrito ? (
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-subtle">
            {sobrescrito}
          </p>
        ) : null}
        {/* Display leve em corpo grande: a face aguenta, e a leveza é o que
            separa "instrumento sereno" de "painel de controle". */}
        <h1 className="mt-1.5 font-display text-[clamp(1.75rem,4vw,2.375rem)] leading-[1.15] font-light tracking-[-0.015em] text-foreground">
          {titulo}
        </h1>
      </div>
      {direita}
    </header>
  );
}

/** As três visões de UM paciente. Nomeado: é um seletor de seção (aba), não uma
 *  migalha — as três são irmãs, ninguém está "dentro" de ninguém, e o que
 *  importa é qual está aberta. */
const ABAS = [
  { chave: "acompanhamento", texto: "Acompanhamento", sufixo: "" },
  { chave: "planos", texto: "Planos", sufixo: "/plans" },
  { chave: "ficha", texto: "Ficha", sufixo: "/ficha" },
] as const;

export type AbaDoPaciente = (typeof ABAS)[number]["chave"];

/**
 * Cabeçalho das telas de um paciente: voltar, nome e abas — nesta ordem, na
 * mesma coluna, nas QUATRO telas. Antes cada tela montava o seu: a de
 * acompanhamento tinha um "← pacientes" numa linha e "planos ficha" soltos em
 * outra, com recuos diferentes e todos no mesmo cinza, então nada dizia onde
 * você estava.
 *
 * A aba aberta é PREENCHIDA na cor do produto. Diferença de tom entre dois
 * cinzas é o que falhava; fundo sólido contra vazado não tem como falhar, e
 * sobrevive aos dois modos.
 */
export function CabecalhoDoPaciente({
  patientId,
  nome,
  ativa,
  direita,
}: {
  patientId: string;
  nome: string;
  ativa: AbaDoPaciente;
  direita?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 font-mono text-xs tracking-[0.04em] text-subtle transition-colors hover:text-foreground"
      >
        <span aria-hidden="true">←</span> pacientes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[clamp(1.75rem,4vw,2.375rem)] leading-[1.15] font-light tracking-[-0.015em] text-foreground">
          {nome}
        </h1>
        {direita}
      </div>

      <nav
        aria-label="Seções do paciente"
        className="flex w-fit gap-1 rounded-full bg-muted p-1"
      >
        {ABAS.map((aba) => {
          const aberta = aba.chave === ativa;
          return (
            <Link
              key={aba.chave}
              href={`/patients/${patientId}${aba.sufixo}`}
              aria-current={aberta ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                aberta
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {aba.texto}
            </Link>
          );
        })}
      </nav>
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
