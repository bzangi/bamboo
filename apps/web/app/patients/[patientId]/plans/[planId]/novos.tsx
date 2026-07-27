"use client";

// AS LINHAS NOVAS do editor: o que ainda não existe no banco e nasce no salvar.
//
// O índice da linha é a POSIÇÃO no array de estado, e é ele que vai no `name`
// (`novo-item.<opcao>.<i>.foodId`). Antes isto era clone de nó do DOM com
// renumeração por regex — o que existia por um motivo que sumiu: o `<select>` de
// ~590 alimentos tornava caro recriar a linha no cliente. Com o seletor de busca
// (`seletor.tsx`) a linha ficou leve, e a posição no array não tem como colidir
// nem precisar de renumeração. Menos código e um modo de falha a menos.
//
// O "+" só existe na ÚLTIMA linha e o "voltar" só nas outras: a última é a linha
// em branco que espera ser preenchida — não há o que descartar nela.
//
// Sem JavaScript continua havendo UMA linha em branco de cada coisa, que salva
// normalmente. Os botões é que deixam de responder.

import { useRef, useState } from "react";
import type { GrupoDto } from "@bamboo/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BotoesDaLinha, Flexibilidade, Quantidade } from "./campos";
import { SeletorDeAlimento } from "./seletor";

/**
 * As chaves das linhas. A CHAVE (para o React) é estável e crescente; o ÍNDICE
 * (para o `name`) é a posição — se a chave fosse o índice, remover a linha do
 * meio reaproveitaria um número já usado e o React manteria o estado da linha
 * errada.
 *
 * `preenchidas` é o que impede empilhar linhas em branco: a linha entra no
 * conjunto quando o campo que a define ganha conteúdo (o alimento escolhido, o
 * nome digitado), e só então o "+" acende. O salvar já ignora linha vazia — mas
 * ignorar em silêncio é o que faz a nutri achar que salvou o que não salvou.
 */
function useLinhas() {
  const [chaves, setChaves] = useState<ReadonlyArray<number>>([0]);
  const [preenchidas, setPreenchidas] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const proxima = useRef(1);
  const ultima = chaves[chaves.length - 1];

  return {
    chaves,
    podeAdicionar: ultima !== undefined && preenchidas.has(ultima),
    adicionar: () => setChaves((c) => [...c, proxima.current++]),
    descartar: (chave: number) =>
      setChaves((c) => (c.length <= 1 ? c : c.filter((k) => k !== chave))),
    /** A linha `chave` tem conteúdo? Chamado pelo campo que a define. */
    marcar: (chave: number, temConteudo: boolean) =>
      setPreenchidas((p) => {
        if (p.has(chave) === temConteudo) return p;
        const novo = new Set(p);
        if (temConteudo) novo.add(chave);
        else novo.delete(chave);
        return novo;
      }),
  };
}

/* ═══════════ alimento ═══════════ */

export function NovosItens({
  prefixo,
  grupos,
  onde,
}: {
  prefixo: string;
  grupos: ReadonlyArray<GrupoDto>;
  onde: string;
}) {
  const { chaves, podeAdicionar, adicionar, descartar, marcar } = useLinhas();
  return (
    <>
      {chaves.map((chave, i) => {
        const k = `${prefixo}.${i}`;
        return (
          <div
            key={chave}
            // `data-item` como nas linhas gravadas: preenchida numa opção
            // PADRÃO, ela já entra no sumário do dia antes de existir no banco.
            data-item
            className="flex flex-wrap items-end gap-2 border-t border-dashed border-border px-3 py-2"
          >
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <Label htmlFor={`${k}.foodId`}>Alimento</Label>
              <SeletorDeAlimento
                name={`${k}.foodId`}
                rotulo={`Novo alimento em ${onde}`}
                novo
                onEscolher={(temAlimento) => marcar(chave, temAlimento)}
              />
            </div>
            <Quantidade prefixo={k} />
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${k}.flex`}>Flexibilidade</Label>
              <Flexibilidade
                id={`${k}.flex`}
                name={`${k}.flex`}
                grupos={grupos}
              />
            </div>
            <BotoesDaLinha
              o_que="alimento"
              ultima={i === chaves.length - 1}
              podeAdicionar={podeAdicionar}
              onAdicionar={adicionar}
              onDescartar={() => descartar(chave)}
            />
          </div>
        );
      })}
    </>
  );
}

/* ═══════════ opção ═══════════ */

export function NovasOpcoes({
  mealId,
  nomeDaRefeicao,
  grupos,
}: {
  mealId: string;
  nomeDaRefeicao: string;
  grupos: ReadonlyArray<GrupoDto>;
}) {
  const { chaves, podeAdicionar, adicionar, descartar, marcar } = useLinhas();
  return (
    <div className="flex flex-col gap-2">
      {chaves.map((chave, i) => (
        <LinhaNovaOpcao
          key={chave}
          prefixo={`nova-op.${mealId}.${i}`}
          nomeDaRefeicao={nomeDaRefeicao}
          grupos={grupos}
          ultima={i === chaves.length - 1}
          podeAdicionar={podeAdicionar}
          onAdicionar={adicionar}
          onDescartar={() => descartar(chave)}
          onNomear={(temNome) => marcar(chave, temNome)}
        />
      ))}
    </div>
  );
}

function LinhaNovaOpcao({
  prefixo,
  nomeDaRefeicao,
  grupos,
  ultima,
  podeAdicionar,
  onAdicionar,
  onDescartar,
  onNomear,
}: {
  prefixo: string;
  nomeDaRefeicao: string;
  grupos: ReadonlyArray<GrupoDto>;
  ultima: boolean;
  podeAdicionar: boolean;
  onAdicionar: () => void;
  onDescartar: () => void;
  onNomear: (temNome: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-sm border border-dashed border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Input
          aria-label={`Nova opção em ${nomeDaRefeicao}`}
          id={`${prefixo}.label`}
          name={`${prefixo}.label`}
          maxLength={120}
          data-rotulo={`Nova opção em ${nomeDaRefeicao}`}
          data-novo=""
          className="h-8 w-56 text-sm"
          autoComplete="off"
          placeholder="Nova opção: arroz e carne"
          onChange={(e) => onNomear(e.target.value.trim().length > 0)}
        />
        {/* Os alimentos da opção nova nascem no MESMO salvar que ela — daí eles
            morarem dentro desta linha, e não numa segunda etapa. */}
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        >
          {aberto ? "▾ alimentos" : "▸ alimentos"}
        </button>
        <BotoesDaLinha
          o_que="opção"
          ultima={ultima}
          podeAdicionar={podeAdicionar}
          onAdicionar={onAdicionar}
          onDescartar={onDescartar}
          className="ml-auto"
        />
      </div>
      {aberto && (
        <NovosItens
          prefixo={`${prefixo}.item`}
          grupos={grupos}
          onde={`nova opção de ${nomeDaRefeicao}`}
        />
      )}
    </div>
  );
}

/* ═══════════ refeição ═══════════ */

export function NovasRefeicoes({
  nomeDoTipo,
  primeiraPosicao,
}: {
  nomeDoTipo: string;
  /** Sugestão de posição: a próxima livre no tipo-de-dia exibido. */
  primeiraPosicao: number;
}) {
  const { chaves, podeAdicionar, adicionar, descartar, marcar } = useLinhas();
  return (
    <>
      {chaves.map((chave, i) => {
        const k = `nova-refeicao.${i}`;
        return (
          <div key={chave} className="flex flex-wrap items-end gap-3 py-2">
            <div className="flex w-16 flex-col gap-1.5">
              <Label htmlFor={`${k}.position`}>Pos.</Label>
              <Input
                id={`${k}.position`}
                name={`${k}.position`}
                type="number"
                step="1"
                min="1"
                max="30"
                defaultValue={primeiraPosicao + i}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${k}.name`}>Nome</Label>
              <Input
                id={`${k}.name`}
                name={`${k}.name`}
                maxLength={120}
                data-rotulo={`Nova refeição em ${nomeDoTipo}`}
                data-novo=""
                className="w-52"
                autoComplete="off"
                placeholder="Almoço"
                onChange={(e) =>
                  marcar(chave, e.target.value.trim().length > 0)
                }
              />
            </div>
            <div className="flex w-32 flex-col gap-1.5">
              <Label htmlFor={`${k}.horario`}>Horário</Label>
              <Input id={`${k}.horario`} name={`${k}.horario`} type="time" />
            </div>
            <BotoesDaLinha
              o_que="refeição"
              ultima={i === chaves.length - 1}
              podeAdicionar={podeAdicionar}
              onAdicionar={adicionar}
              onDescartar={() => descartar(chave)}
            />
          </div>
        );
      })}
    </>
  );
}

/* ═══════════ tipo-de-dia ═══════════ */

export function NovosTiposDeDia() {
  const { chaves, podeAdicionar, adicionar, descartar, marcar } = useLinhas();
  return (
    <>
      {chaves.map((chave, i) => (
        <div key={chave} className="flex flex-wrap items-end gap-2 pb-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`novo-tipo.${i}.name`}>Novo tipo-de-dia</Label>
            <Input
              id={`novo-tipo.${i}.name`}
              name={`novo-tipo.${i}.name`}
              maxLength={120}
              data-rotulo="Novo tipo-de-dia"
              data-novo=""
              className="w-56"
              autoComplete="off"
              placeholder="Treino"
              onChange={(e) => marcar(chave, e.target.value.trim().length > 0)}
            />
          </div>
          <BotoesDaLinha
            o_que="tipo-de-dia"
            ultima={i === chaves.length - 1}
            podeAdicionar={podeAdicionar}
            onAdicionar={adicionar}
            onDescartar={() => descartar(chave)}
          />
        </div>
      ))}
    </>
  );
}
