// A FAIXA do sumário nutricional. Sem diretiva de propósito (padrão do
// `campos.tsx`): o modo leitura a renderiza no servidor, e a ilha client do modo
// de edição renderiza a MESMA faixa a cada tecla — dois desenhos do mesmo painel
// divergiriam no primeiro ajuste.

import { Mono } from "@/components/chrome";
import { cn } from "@/lib/utils";
import { numero, type Resumo } from "./resumo";

function Metrica({
  rotulo,
  valor,
  unidade,
  faltam,
}: {
  rotulo: string;
  valor: string;
  unidade: string;
  /** Quantos itens não têm este dado na base. */
  faltam?: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-subtle">
        {rotulo}
      </span>
      <span className="flex items-baseline gap-1">
        <Mono className="text-lg leading-none text-foreground">{valor}</Mono>
        <span className="text-xs text-muted-foreground">{unidade}</span>
        {/* O asterisco é o que impede o número de mentir: a base tem fibra e
            sódio nullable, e um total que ignora isso em silêncio parece exato. */}
        {faltam !== undefined && faltam > 0 && (
          <span
            className="cursor-help text-xs text-pulei"
            title={`${faltam} ${
              faltam === 1 ? "alimento não tem" : "alimentos não têm"
            } este dado na base — o total é o mínimo conhecido.`}
          >
            *
          </span>
        )}
      </span>
    </div>
  );
}

export function PainelResumo({
  resumo: r,
  nomeDoTipo,
  className,
}: {
  resumo: Resumo;
  nomeDoTipo: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-card px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <Metrica rotulo="kcal" valor={numero(r.kcal, 0)} unidade="kcal" />
        <Metrica rotulo="proteína" valor={numero(r.protein, 1)} unidade="g" />
        <Metrica rotulo="carbo" valor={numero(r.carb, 1)} unidade="g" />
        <Metrica rotulo="gordura" valor={numero(r.fat, 1)} unidade="g" />
        <Metrica
          rotulo="fibra"
          valor={numero(r.fiber, 1)}
          unidade="g"
          faltam={r.semFibra}
        />
        <Metrica
          rotulo="sódio"
          valor={numero(r.sodium, 0)}
          unidade="mg"
          faltam={r.semSodio}
        />
      </div>
      <p className="mt-2 border-t border-border pt-2 text-xs text-subtle">
        {r.itens === 0
          ? `Nenhum alimento com quantidade nas opções padrão de ${nomeDoTipo}.`
          : `${nomeDoTipo}: opção padrão de cada refeição, ${r.itens} ${
              r.itens === 1 ? "alimento" : "alimentos"
            }. Item à vontade não entra na conta.`}
      </p>
    </div>
  );
}
