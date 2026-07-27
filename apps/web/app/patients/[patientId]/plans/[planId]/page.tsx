// O EDITOR DE PLANO (017 / US3+US5): a tela em que a nutri monta
// `tipo-de-dia → refeição → opção → item` e programa a semana.
//
// Uma leitura para o grafo inteiro (`getPlan`), duas para o catálogo. Toda escrita
// é Server Action; nenhum componente client, nenhum estado no navegador.
//
// DOIS MODOS, e o modo é a URL (`?edit=1`), não estado no navegador:
//  · LEITURA (padrão) — o plano como texto. É o que a nutri faz 9 vezes em 10:
//    conferir. Sem campo nenhum não há como alterar o plano por engano.
//  · EDIÇÃO — a tela inteira vira UM formulário com UM botão no fim. Nada de
//    salvar por linha, e nada de excluir por linha: a lixeirinha é um checkbox
//    que MARCA para excluir. Enquanto a nutri edita, o plano no banco não mudou.
//
// Cada campo editável carrega DUAS coisas: um `orig.<chave>` oculto, que faz o
// salvar mandar só o que mudou em vez de ~30 PATCHes idênticos; e um par
// `data-rotulo`/`data-orig`, que é o que a revisão antes de salvar lê para
// montar o diff (`diff.ts`). Os dois saem do mesmo dado, mas em formatos
// diferentes de propósito: o primeiro é para comparar, o segundo é para LER —
// "125 g → à vontade", não "f1|0|true|g2".
//
// Mostra UM tipo-de-dia por vez (`?dayType=`): é o que mantém o número de
// `<select>` de ~590 alimentos na página em ~4–8 em vez do plano inteiro
// (plan.md/D9).
import type * as React from "react";
import Link from "next/link";
import type {
  FoodDto,
  GrupoDto,
  NutriPatientDto,
  PlanoDto,
  PlanoItemDto,
  PlanoOpcaoDto,
  PlanoRefeicaoDto,
  PlanoTipoDiaDto,
} from "@bamboo/types";
import {
  Aviso,
  Cabecalho,
  Falha,
  Mono,
  Pagina,
  Trilha,
  Vazio,
} from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findPatient } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  assinaturaItem,
  assinaturaRefeicao,
  assinaturaSemana,
} from "@/lib/lote";
import {
  explicarFalha,
  getPlan,
  listGroups,
  listPatients,
  searchFoods,
} from "@/lib/nutri";
import { salvarTudo } from "../../../../acoes";
import { LinhasRepetiveis } from "./repetir";
import { SalvarComRevisao } from "./revisao";

/** 0=domingo … 6=sábado — a mesma convenção de `day_schedule`. */
const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

type Ctx = { patientId: string; planId: string; dayTypeId: string };

/* ═══════════ pedaços ═══════════ */

/** O valor que o `orig.` guarda: a assinatura tem de casar, campo a campo, com a
 *  que `salvarTudo` remonta do FormData — senão o lote manda escrita à toa (ou,
 *  pior, deixa de mandar a que importa). */
function Original({ chave, valor }: { chave: string; valor: string }) {
  return <input type="hidden" name={`orig.${chave}`} value={valor} />;
}

function IconeLixeira() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M10 4.5h4M6.5 7l.9 12.2h9.2L17.5 7M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

function IconeVoltar() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h9a5.5 5.5 0 0 1 0 11h-4M4 8l4-4M4 8l4 4" />
    </svg>
  );
}

/**
 * A lixeirinha: um CHECKBOX, não um botão que apaga na hora.
 *
 * Exclusão instantânea no meio de um formulário que só salva no fim é a única
 * coisa da tela que não dava para desfazer fechando a página — e ficaria de
 * fora da revisão, que é justamente onde "refeição removida" precisa aparecer.
 * Marcada, a linha esmaece e a lixeira acende; quem apaga é o salvar.
 *
 * `sr-only` no input e o ícone no `<label>`: o alvo de clique é o rótulo
 * inteiro, e o estado marcado é visível por `has-[:checked]` — CSS, sem JS.
 */
function Remover({ alvo, rotulo }: { alvo: string; rotulo: string }) {
  return (
    <label
      title={`${rotulo} ao salvar — clique de novo para desfazer`}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icone" }),
        "shrink-0 text-subtle hover:bg-destructive/10 hover:text-destructive",
        // Marcada, ela deixa de ser "excluir" e passa a ser "desfazer" — e fica
        // TÃO acesa quanto o "+", porque numa linha esmaecida ela é o único
        // controle que ainda responde.
        "has-[:checked]:border has-[:checked]:border-border has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:hover:bg-muted has-[:checked]:hover:text-foreground",
      )}
    >
      <input
        type="checkbox"
        name="remover"
        value={alvo}
        data-remover=""
        data-rotulo={rotulo}
        aria-label={rotulo}
        className="peer sr-only"
      />
      {/* Os dois ícones convivem e o `peer-checked` escolhe: trocar ícone por
          estado não precisa de JavaScript, e o ícone tem de dizer o que o
          PRÓXIMO clique faz — lixeira vermelha numa linha já marcada sugeria
          apagar de novo. */}
      <span className="peer-checked:hidden">
        <IconeLixeira />
      </span>
      <span className="hidden peer-checked:block">
        <IconeVoltar />
      </span>
    </label>
  );
}

/** A marcação de flexibilidade como UM controle de três formas: livre, travado, ou
 *  flexível dentro de um grupo. Dois controles separados (`isLocked` + grupo)
 *  permitiriam a combinação que a API recusa com 400 — aqui ela é inexpressável. */
function Flexibilidade({
  id,
  name,
  grupos,
  item,
  onde,
  grupo,
}: {
  id: string;
  name: string;
  grupos: ReadonlyArray<GrupoDto>;
  item?: PlanoItemDto;
  /** Onde este campo vive, para a revisão nomear a mudança. */
  onde?: string;
  grupo?: string;
}) {
  return (
    <Select
      id={id}
      name={name}
      defaultValue={flexValor(item)}
      title={flexExibido(item) || undefined}
      data-rotulo={onde}
      data-orig={onde ? flexExibido(item) : undefined}
      data-grupo={grupo}
      className="w-52"
    >
      <option value="">{FLEX_LIVRE}</option>
      <option value="travado">{FLEX_TRAVADO}</option>
      {grupos.map((g) => (
        <option key={g.id} value={g.id}>
          {flexTrocaEm(g.name)}
        </option>
      ))}
    </Select>
  );
}

/** O `<select>` nativo TRUNCA o rótulo escolhido quando ele não cabe (e cabe
 *  pouco, com nomes da TACO). O `title` devolve o texto inteiro na parada do
 *  mouse — nativo, sem uma linha de JS. Ele reflete o valor RENDERIZADO: sem
 *  JavaScript não há como reescrevê-lo quando a nutri troca a escolha, e a lista
 *  aberta já mostra os nomes por extenso. */
function CampoAlimento({
  id,
  name,
  foods,
  item,
  rotulo,
  grupo,
  novo,
}: {
  id: string;
  name: string;
  foods: ReadonlyArray<FoodDto>;
  item?: PlanoItemDto;
  rotulo?: string;
  /** Id do nó: mudanças no mesmo nó viram UMA linha na revisão. */
  grupo?: string;
  /** Linha em branco no fim da lista: preenchê-la é uma ADIÇÃO, não uma edição. */
  novo?: boolean;
}) {
  return (
    <Select
      id={id}
      name={name}
      defaultValue={item?.foodId ?? ""}
      title={item?.foodName}
      required={item !== undefined}
      data-rotulo={rotulo}
      data-orig={novo ? undefined : item?.foodName}
      data-grupo={grupo}
      data-novo={novo ? "" : undefined}
      className="w-full min-w-56"
    >
      <option value="">Escolha o alimento…</option>
      {foods.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </Select>
  );
}

const FLEX_LIVRE = "Flexível, sem grupo";
const FLEX_TRAVADO = "Travado (não troca)";
const flexTrocaEm = (grupo: string) => `Troca dentro de: ${grupo}`;

/** O que o `<select>` de flexibilidade EXIBE hoje — o `data-orig` da revisão
 *  compara texto com texto, então tem de sair das mesmas frases das `<option>`. */
const flexExibido = (item?: PlanoItemDto): string => {
  if (!item) return "";
  if (item.isLocked) return FLEX_TRAVADO;
  return item.substitutionGroupName
    ? flexTrocaEm(item.substitutionGroupName)
    : FLEX_LIVRE;
};

const flexValor = (item?: PlanoItemDto): string =>
  item?.isLocked ? "travado" : (item?.substitutionGroupId ?? "");

const flexTexto = (item: PlanoItemDto): string =>
  item.isLocked
    ? "travado"
    : (item.substitutionGroupName ?? "flexível, sem grupo");

/* ═══════════ item ═══════════ */

function ItemLeitura({ item }: { item: PlanoItemDto }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border px-3 py-2 text-sm">
      <span
        className="min-w-0 flex-1 truncate text-foreground"
        title={item.foodName}
      >
        {item.foodName}
      </span>
      {/* "0 g" na tela é a tela mentindo com número certo (018): quem lê o plano
          precisa ver a prescrição, e a prescrição aqui é "não tem quantidade". */}
      {item.adLibitum ? (
        <span className="text-xs text-muted-foreground italic">à vontade</span>
      ) : (
        <Mono className="text-muted-foreground">{item.quantityGrams} g</Mono>
      )}
      <span className="text-xs text-subtle">{flexTexto(item)}</span>
    </li>
  );
}

/**
 * Quantidade: gramas OU "à vontade" (018).
 *
 * Um checkbox ao lado do campo, e não um `0` mágico digitado — 0 g é como a API
 * grava, não é o que a nutri quer dizer. Marcado, o campo de gramas apaga
 * (`peer-checked`, CSS puro): a tela mostra que aquele número deixou de valer,
 * mesmo sem JavaScript para desabilitá-lo. Quem decide é o checkbox, dos dois
 * lados — a ação zera as gramas e a API também.
 *
 * `min={0}` e não `min={1}`: item à vontade JÁ está gravado com 0, e o navegador
 * barrava o formulário inteiro num valor que a API considera correto. Quem
 * recusa 0 sem "à vontade" continua sendo a API — lá a regra é uma só.
 */
const quantidadeExibida = (item: PlanoItemDto): string =>
  item.adLibitum ? "à vontade" : `${item.quantityGrams} g`;

function Quantidade({
  prefixo,
  item,
  onde,
  grupo,
}: {
  prefixo: string;
  item?: PlanoItemDto;
  onde?: string;
  grupo?: string;
}) {
  // Os ids saem do `name`, que já é único — e é o que o clone renumera junto.
  const idGramas = `${prefixo}.quantityGrams`;
  const idVontade = `${prefixo}.aVontade`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={idGramas}>Quantidade</Label>
      {/* Os três são IRMÃOS de propósito: o `peer-checked` do campo de gramas é
          o seletor `~` do CSS, que só enxerga irmão — checkbox dentro do
          `<label>` deixaria de alcançá-lo. */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={idVontade}
          name={`${prefixo}.aVontade`}
          value="1"
          defaultChecked={item?.adLibitum ?? false}
          className="peer accent-[var(--feito)]"
        />
        <label
          htmlFor={idVontade}
          className="cursor-pointer text-xs whitespace-nowrap text-muted-foreground"
          title="Item sem quantidade prescrita: salada, verduras."
        >
          à vontade
        </label>
        <Input
          id={idGramas}
          name={`${prefixo}.quantityGrams`}
          type="number"
          step="1"
          min="0"
          max="5000"
          defaultValue={item ? item.quantityGrams : undefined}
          placeholder="g"
          aria-label="Gramas"
          data-quantidade=""
          data-rotulo={onde}
          data-orig={item && onde ? quantidadeExibida(item) : undefined}
          data-grupo={grupo}
          className="w-20 transition-opacity peer-checked:opacity-30"
        />
      </div>
    </div>
  );
}

function ItemEdicao({
  item,
  foods,
  grupos,
  onde,
}: {
  item: PlanoItemDto;
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
  onde: string;
}) {
  const k = `item.${item.id}`;
  const aqui = `${onde} · ${item.foodName}`;
  return (
    <li className="flex flex-wrap items-end gap-2 border-t border-border px-3 py-2 has-[>label>input:checked]:[&>*:not(label)]:opacity-40">
      <Original
        chave={k}
        valor={assinaturaItem(
          item.foodId,
          item.quantityGrams,
          item.adLibitum,
          flexValor(item),
        )}
      />
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <Label htmlFor={`food-${item.id}`}>Alimento</Label>
        <CampoAlimento
          id={`food-${item.id}`}
          name={`${k}.foodId`}
          foods={foods}
          item={item}
          rotulo={aqui}
          grupo={item.id}
        />
      </div>
      <Quantidade prefixo={k} item={item} onde={aqui} grupo={item.id} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`flex-${item.id}`}>Flexibilidade</Label>
        <Flexibilidade
          id={`flex-${item.id}`}
          name={`${k}.flex`}
          grupos={grupos}
          item={item}
          onde={aqui}
          grupo={item.id}
        />
      </div>
      <Remover alvo={`item:${item.id}`} rotulo={`Excluir ${aqui}`} />
    </li>
  );
}

/* ═══════════ opção ═══════════ */

/**
 * A LINHA EM BRANCO de item — a que espera ser preenchida no fim de cada lista,
 * e a que o "+" clona.
 *
 * `data-slot` é o prefixo ANTES do índice: é por ele que o clone se renumera
 * sem colidir com a linha de cima, e sem confundir o índice do alimento com o
 * da opção que o contém (`repetir-dom.ts`). Os `id` são o próprio `name`, que
 * já é único — assim não há um segundo esquema de identificador para manter.
 */
function LinhaNovoItem({
  prefixo,
  indice,
  foods,
  grupos,
  onde,
}: {
  prefixo: string;
  indice: number;
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
  onde: string;
}) {
  const k = `${prefixo}.${indice}`;
  return (
    <div
      data-linha-nova=""
      data-slot={prefixo}
      className="flex flex-wrap items-end gap-2 border-t border-dashed border-border px-3 py-2"
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <Label htmlFor={`${k}.foodId`}>Alimento</Label>
        <CampoAlimento
          id={`${k}.foodId`}
          name={`${k}.foodId`}
          foods={foods}
          rotulo={`Novo alimento em ${onde}`}
          novo
        />
      </div>
      <Quantidade prefixo={k} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${k}.flex`}>Flexibilidade</Label>
        <Flexibilidade id={`${k}.flex`} name={`${k}.flex`} grupos={grupos} />
      </div>
      <BotoesDaLinha o_que="alimento" />
    </div>
  );
}

/** A LINHA EM BRANCO de opção: o rótulo, os alimentos dela (atrás de um clique)
 *  e os dois botões. A opção e seus alimentos nascem no MESMO salvar. */
function LinhaNovaOpcao({
  mealId,
  nomeDaRefeicao,
  indice,
  foods,
  grupos,
}: {
  mealId: string;
  nomeDaRefeicao: string;
  indice: number;
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
}) {
  const prefixo = `nova-op.${mealId}`;
  const k = `${prefixo}.${indice}`;
  return (
    <div
      data-linha-nova=""
      data-slot={prefixo}
      className="rounded-sm border border-dashed border-border"
    >
      {/* O "alimentos" é um checkbox escondido + `<label>`: revelar um bloco não
          precisa de JavaScript. Ele é irmão do bloco revelado, que é o que o
          `peer-checked` exige. */}
      <input
        type="checkbox"
        id={`${k}.abrir`}
        className="peer sr-only"
        aria-label={`Alimentos da nova opção de ${nomeDaRefeicao}`}
      />
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Input
          aria-label={`Nova opção em ${nomeDaRefeicao}`}
          id={`${k}.label`}
          name={`${k}.label`}
          maxLength={120}
          data-rotulo={`Nova opção em ${nomeDaRefeicao}`}
          data-novo=""
          className="h-8 w-56 text-sm"
          autoComplete="off"
          placeholder="Nova opção: arroz e carne"
        />
        <label
          htmlFor={`${k}.abrir`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "shrink-0",
          )}
        >
          alimentos
        </label>
        <BotoesDaLinha o_que="opção" className="ml-auto" />
      </div>
      <LinhasRepetiveis className="hidden peer-checked:block">
        <LinhaNovoItem
          prefixo={`${k}.item`}
          indice={0}
          foods={foods}
          grupos={grupos}
          onde={`nova opção de ${nomeDaRefeicao}`}
        />
      </LinhasRepetiveis>
    </div>
  );
}

/**
 * Os dois botões da linha pendente: "+" põe outra igual embaixo, o "voltar"
 * descarta esta (`repetir.tsx`). `type="button"` nos dois — aqui não se salva
 * nada, e o salvar continua sendo um só.
 *
 * Não é a mesma lixeirinha do nó GRAVADO: lá ela marca para excluir no salvar;
 * aqui não há o que marcar, a linha ainda não existe em lugar nenhum — por isso
 * o ícone é o de desfazer, não o de apagar.
 */
function BotoesDaLinha({
  o_que,
  className,
}: {
  o_que: string;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <button
        type="button"
        data-mais=""
        title={`Adicionar outro ${o_que}`}
        aria-label={`Adicionar outro ${o_que}`}
        className={cn(
          buttonVariants({ variant: "outline", size: "icone" }),
          "text-lg leading-none",
        )}
      >
        +
      </button>
      <button
        type="button"
        data-menos=""
        title={`Descartar este ${o_que}`}
        aria-label={`Descartar este ${o_que}`}
        className={cn(buttonVariants({ variant: "outline", size: "icone" }))}
      >
        <IconeVoltar />
      </button>
    </div>
  );
}

function Opcao({
  opcao,
  mealId,
  editando,
  foods,
  grupos,
  onde,
  padraoAtual,
}: {
  opcao: PlanoOpcaoDto;
  mealId: string;
  editando: boolean;
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
  onde: string;
  /** O rótulo da opção padrão HOJE — o `data-orig` do grupo de rádio. */
  padraoAtual: string;
}) {
  const aqui = `${onde} · ${opcao.label}`;
  return (
    <div className="rounded-sm border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/60 px-3 py-2 has-[>label>input:checked]:[&>*:not(label)]:opacity-40">
        {editando ? (
          <>
            <Original chave={`op.${opcao.id}`} valor={opcao.label} />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                aria-label="Nome da opção"
                name={`op.${opcao.id}.label`}
                defaultValue={opcao.label}
                maxLength={120}
                required
                data-rotulo={`${aqui} — nome da opção`}
                data-orig={opcao.label}
                className="h-8 w-56 text-sm"
                autoComplete="off"
              />
              {/* Padrão como grupo de rádio: "duas padrão na mesma refeição" não
                  é um estado que este formulário consiga produzir. */}
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="radio"
                  name={`padrao.${mealId}`}
                  value={opcao.id}
                  defaultChecked={opcao.isDefault}
                  data-rotulo={`${onde} — opção padrão`}
                  data-orig={padraoAtual}
                  data-valor={opcao.label}
                  className="accent-[var(--feito)]"
                />
                padrão
              </label>
            </div>
            <Remover
              alvo={`opcao:${opcao.id}`}
              rotulo={`Excluir a opção ${aqui}`}
            />
          </>
        ) : (
          <>
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {opcao.label}
            </span>
            {opcao.isDefault && <Badge variant="feito">padrão</Badge>}
          </>
        )}
      </div>

      {opcao.items.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-sm text-subtle">
          Nenhum alimento nesta opção.
        </p>
      ) : (
        <ul>
          {opcao.items.map((i) =>
            editando ? (
              <ItemEdicao
                key={i.id}
                item={i}
                foods={foods}
                grupos={grupos}
                onde={aqui}
              />
            ) : (
              <ItemLeitura key={i.id} item={i} />
            ),
          )}
        </ul>
      )}

      {editando && (
        <LinhasRepetiveis>
          <LinhaNovoItem
            prefixo={`novo-item.${opcao.id}`}
            indice={0}
            foods={foods}
            grupos={grupos}
            onde={aqui}
          />
        </LinhasRepetiveis>
      )}
    </div>
  );
}

/* ═══════════ refeição ═══════════ */

function Refeicao({
  refeicao,
  editando,
  foods,
  grupos,
}: {
  refeicao: PlanoRefeicaoDto;
  editando: boolean;
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
}) {
  const k = `meal.${refeicao.id}`;
  const hora = refeicao.horario?.slice(0, 5) ?? "";
  const padrao = refeicao.options.find((o) => o.isDefault);
  const padraoAtual = padrao?.id ?? "";
  return (
    <Card>
      <CardHeader className="has-[>label>input:checked]:[&>*:not(label)]:opacity-40">
        {editando ? (
          <>
            {/* `hora` e não `refeicao.horario`: o DTO traz HH:MM:SS e o
                `<input type=time>` devolve HH:MM — comparar os dois faria toda
                refeição parecer alterada em todo salvar. */}
            <Original
              chave={k}
              valor={assinaturaRefeicao(
                refeicao.name,
                refeicao.position,
                hora === "" ? null : hora,
              )}
            />
            <Original chave={`padrao.${refeicao.id}`} valor={padraoAtual} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex w-14 flex-col gap-1">
                <Label htmlFor={`pos-${refeicao.id}`}>Pos.</Label>
                <Input
                  id={`pos-${refeicao.id}`}
                  name={`${k}.position`}
                  type="number"
                  step="1"
                  min="1"
                  max="30"
                  defaultValue={refeicao.position}
                  required
                  data-rotulo={refeicao.name}
                  data-orig={String(refeicao.position)}
                  data-grupo={refeicao.id}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`nome-${refeicao.id}`}>Refeição</Label>
                <Input
                  id={`nome-${refeicao.id}`}
                  name={`${k}.name`}
                  defaultValue={refeicao.name}
                  maxLength={120}
                  required
                  data-rotulo={refeicao.name}
                  data-orig={refeicao.name}
                  data-grupo={refeicao.id}
                  className="w-52"
                  autoComplete="off"
                />
              </div>
              <div className="flex w-32 flex-col gap-1">
                <Label htmlFor={`hora-${refeicao.id}`}>Horário</Label>
                <Input
                  id={`hora-${refeicao.id}`}
                  name={`${k}.horario`}
                  type="time"
                  defaultValue={hora}
                  data-rotulo={refeicao.name}
                  data-orig={hora}
                  data-grupo={refeicao.id}
                />
              </div>
            </div>
            <Remover
              alvo={`refeicao:${refeicao.id}`}
              rotulo={`Excluir a refeição ${refeicao.name}`}
            />
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2.5">
              <Mono className="text-subtle">{refeicao.position}</Mono>
              <CardTitle>{refeicao.name}</CardTitle>
            </div>
            {hora ? (
              <Mono className="text-muted-foreground">{hora}</Mono>
            ) : null}
          </>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {refeicao.options.length === 0 && (
          <p className="text-sm text-subtle">
            Sem opção nenhuma — o app do paciente não tem o que mostrar nesta
            refeição.
          </p>
        )}
        {refeicao.options.map((o) => (
          <Opcao
            key={o.id}
            opcao={o}
            mealId={refeicao.id}
            editando={editando}
            foods={foods}
            grupos={grupos}
            onde={refeicao.name}
            padraoAtual={padrao?.label ?? ""}
          />
        ))}

        {editando && (
          <LinhasRepetiveis className="flex flex-col gap-2">
            <LinhaNovaOpcao
              mealId={refeicao.id}
              nomeDaRefeicao={refeicao.name}
              indice={0}
              foods={foods}
              grupos={grupos}
            />
          </LinhasRepetiveis>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════ a tela ═══════════ */

export default async function Editor({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string; planId: string }>;
  searchParams: Promise<{ dayType?: string; erro?: string; edit?: string }>;
}) {
  const { patientId, planId } = await params;
  const { dayType, erro, edit } = await searchParams;
  const editando = edit === "1";

  let plano: PlanoDto;
  let paciente: NutriPatientDto | undefined;
  let foods: ReadonlyArray<FoodDto> = [];
  let grupos: ReadonlyArray<GrupoDto> = [];
  try {
    plano = await getPlan(planId);
    paciente = findPatient((await listPatients()).patients, patientId);
    if (editando) {
      // Catálogo inteiro numa tacada: alimenta os `<select>` nativos, que dão
      // type-ahead do navegador de graça e funcionam sem JavaScript. Só no modo
      // de edição — a leitura já traz o nome do alimento resolvido no DTO.
      foods = (await searchFoods("", 600)).foods;
      grupos = (await listGroups()).groups;
    }
  } catch (e) {
    const { titulo, detalhe } = explicarFalha(e);
    return (
      <Pagina>
        <Trilha
          itens={[{ href: "/", texto: "pacientes" }, { texto: "plano" }]}
        />
        <Falha titulo={titulo} detalhe={detalhe} />
      </Pagina>
    );
  }

  const nome = paciente?.name ?? "paciente";
  const tipos = plano.dayTypes;
  const selecionado: PlanoTipoDiaDto | undefined =
    tipos.find((t) => t.id === dayType) ?? tipos[0];
  const rota = `/patients/${patientId}/plans/${planId}`;
  const qs = (extra?: string) =>
    [selecionado ? `dayType=${selecionado.id}` : "", extra]
      .filter(Boolean)
      .join("&");
  const semanaPorDia = new Map(plano.week.map((d) => [d.weekday, d.dayTypeId]));
  const nomeDoTipo = (id: string | undefined) =>
    tipos.find((t) => t.id === id)?.name ?? "—";
  const ctx: Ctx = {
    patientId,
    planId,
    dayTypeId: selecionado?.id ?? "",
  };

  const conteudo = (
    <>
      {/* ─── tipos-de-dia ─── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tipos-de-dia</CardTitle>
            <CardDescription>
              O plano é um CONJUNTO de tipos-de-dia (treino, descanso), não um
              cardápio fixo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {tipos.length === 0 && (
            <p className="text-sm text-subtle">
              Nenhum tipo-de-dia.{" "}
              {editando
                ? "Crie o primeiro abaixo"
                : "Entre em Editar para criar o primeiro"}{" "}
              — sem ele não há onde pôr refeição.
            </p>
          )}
          {tipos.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0 has-[>label>input:checked]:[&>*:not(label)]:opacity-40"
            >
              {editando ? (
                <>
                  <Original chave={`dt.${t.id}`} valor={t.name} />
                  <Input
                    aria-label={`Nome do tipo-de-dia ${t.name}`}
                    name={`dt.${t.id}.name`}
                    defaultValue={t.name}
                    maxLength={120}
                    required
                    data-rotulo={`Tipo-de-dia ${t.name} — nome`}
                    data-orig={t.name}
                    className="h-8 w-56 text-sm"
                    autoComplete="off"
                  />
                </>
              ) : (
                <span className="text-sm font-medium text-foreground">
                  {t.name}
                </span>
              )}
              {/* Mono e Remover são IRMÃOS diretos da linha: o esmaecer da
                  marcação pula o `<label>`, e só pula quem é filho direto. */}
              <Mono className="ml-auto text-subtle">
                {t.meals.length}{" "}
                {t.meals.length === 1 ? "refeição" : "refeições"}
              </Mono>
              {editando && (
                <Remover
                  alvo={`tipo-de-dia:${t.id}`}
                  rotulo={`Excluir o tipo-de-dia ${t.name}`}
                />
              )}
            </div>
          ))}

          {editando && (
            <LinhasRepetiveis className="border-t border-dashed border-border pt-3">
              <div
                data-linha-nova=""
                className="flex flex-wrap items-end gap-2 pb-2"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="novo-tipo-0">Novo tipo-de-dia</Label>
                  <Input
                    id="novo-tipo-0"
                    name="novo-tipo.0.name"
                    maxLength={120}
                    data-rotulo="Novo tipo-de-dia"
                    data-novo=""
                    className="w-56"
                    autoComplete="off"
                    placeholder="Treino"
                  />
                </div>
                <BotoesDaLinha o_que="tipo-de-dia" />
              </div>
            </LinhasRepetiveis>
          )}
        </CardContent>
      </Card>

      {/* ─── a semana ─── */}
      {tipos.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>A semana</CardTitle>
              <CardDescription>
                Que tipo-de-dia cada dia assume por padrão. Os sete dias são
                salvos juntos — o paciente pode sobrescrever no app.
              </CardDescription>
            </div>
            {plano.week.length === 7 ? (
              <Badge variant="feito">programada</Badge>
            ) : (
              <Badge variant="pulei">não programada</Badge>
            )}
          </CardHeader>
          <CardContent>
            {editando && (
              <Original
                chave="semana"
                // Semana incompleta: assinatura vazia de propósito, para que o
                // salvar GRAVE os sete dias mesmo que a nutri não toque em
                // nenhum `<select>` — os defaults exibidos viram a programação.
                valor={
                  plano.week.length === 7
                    ? assinaturaSemana(
                        DIAS.map((_, w) => semanaPorDia.get(w) ?? ""),
                      )
                    : ""
                }
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DIAS.map((rotulo, weekday) => {
                const atual = semanaPorDia.get(weekday) ?? tipos[0]?.id ?? "";
                return (
                  <div key={weekday} className="flex flex-col gap-1.5">
                    <Label htmlFor={`d${weekday}`}>{rotulo}</Label>
                    {editando ? (
                      <Select
                        id={`d${weekday}`}
                        name={`d${weekday}`}
                        defaultValue={atual}
                        title={nomeDoTipo(atual)}
                        required
                        data-rotulo={`Semana — ${rotulo}`}
                        data-orig={
                          plano.week.length === 7 ? nomeDoTipo(atual) : ""
                        }
                      >
                        {tipos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <p
                        className="truncate text-sm text-foreground"
                        title={nomeDoTipo(semanaPorDia.get(weekday))}
                      >
                        {plano.week.length === 7
                          ? nomeDoTipo(semanaPorDia.get(weekday))
                          : "—"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── o cardápio de UM tipo-de-dia ─── */}
      {selecionado && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <span className="font-mono text-xs uppercase tracking-widest text-subtle">
              cardápio de
            </span>
            {tipos.map((t) => (
              <Link
                key={t.id}
                href={`${rota}?dayType=${t.id}${editando ? "&edit=1" : ""}`}
              >
                <Button
                  variant={t.id === selecionado.id ? "default" : "outline"}
                  size="sm"
                >
                  {t.name}
                </Button>
              </Link>
            ))}
          </div>

          {selecionado.meals.length === 0 ? (
            <Vazio titulo={`${selecionado.name} não tem refeição`}>
              A posição é o que pareia esta refeição com a de mesmo número nos
              outros tipos-de-dia — é o que faz a troca de tipo-de-dia
              funcionar.
            </Vazio>
          ) : (
            <div className="flex flex-col gap-4">
              {selecionado.meals.map((m) => (
                <Refeicao
                  key={m.id}
                  refeicao={m}
                  editando={editando}
                  foods={foods}
                  grupos={grupos}
                />
              ))}
            </div>
          )}

          {editando && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>Nova refeição em {selecionado.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <LinhasRepetiveis>
                  <div
                    data-linha-nova=""
                    className="flex flex-wrap items-end gap-3 py-2"
                  >
                    <div className="flex w-16 flex-col gap-1.5">
                      <Label htmlFor="nova-pos-0">Pos.</Label>
                      <Input
                        id="nova-pos-0"
                        name="nova-refeicao.0.position"
                        type="number"
                        step="1"
                        min="1"
                        max="30"
                        defaultValue={selecionado.meals.length + 1}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="nova-nome-0">Nome</Label>
                      <Input
                        id="nova-nome-0"
                        name="nova-refeicao.0.name"
                        maxLength={120}
                        data-rotulo={`Nova refeição em ${selecionado.name}`}
                        data-novo=""
                        className="w-52"
                        autoComplete="off"
                        placeholder="Almoço"
                      />
                    </div>
                    <div className="flex w-32 flex-col gap-1.5">
                      <Label htmlFor="nova-hora-0">Horário</Label>
                      <Input
                        id="nova-hora-0"
                        name="nova-refeicao.0.horario"
                        type="time"
                      />
                    </div>
                    <BotoesDaLinha o_que="refeição" />
                  </div>
                </LinhasRepetiveis>
                <p className="pb-2 text-xs text-subtle">
                  A refeição nasce com uma opção “Padrão” — depois de salvar,
                  ela já aceita alimentos.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );

  return (
    <Pagina>
      <Trilha
        itens={[
          { href: "/", texto: "pacientes" },
          { href: `/patients/${patientId}`, texto: nome },
          { href: `/patients/${patientId}/plans`, texto: "planos" },
          { texto: plano.name },
        ]}
      />
      <Cabecalho
        sobrescrito={`plano de ${nome}`}
        titulo={plano.name}
        direita={
          <div className="flex items-center gap-2">
            {plano.isActive ? (
              <Badge variant="feito">ativo</Badge>
            ) : (
              <Badge variant="contorno">inativo</Badge>
            )}
            {editando ? (
              <Link href={`${rota}?${qs()}`}>
                <Button variant="outline" size="sm">
                  Cancelar
                </Button>
              </Link>
            ) : (
              <>
                <Link href={`/patients/${patientId}/plans`}>
                  <Button variant="outline" size="sm">
                    Todos os planos
                  </Button>
                </Link>
                <Link href={`${rota}?${qs("edit=1")}`}>
                  <Button size="sm">Editar</Button>
                </Link>
              </>
            )}
          </div>
        }
      />

      <Aviso codigo={erro} />

      {editando ? (
        <form className="flex flex-col gap-7" action={salvarTudo}>
          <input type="hidden" name="patientId" value={ctx.patientId} />
          <input type="hidden" name="planId" value={ctx.planId} />
          <input type="hidden" name="dayTypeId" value={ctx.dayTypeId} />
          {conteudo}
          {/* O ÚNICO botão de salvar da tela — e ele abre a REVISÃO antes de
              escrever (`revisao.tsx`), listando o diff do que o formulário vai
              mudar. Sair pelos chips de tipo-de-dia é navegação: o que estava
              digitado e não foi salvo se perde, como em qualquer formulário. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <SalvarComRevisao />
            <Link href={`${rota}?${qs()}`}>
              <Button variant="ghost" size="sm" type="button">
                Cancelar
              </Button>
            </Link>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-7">{conteudo}</div>
      )}
    </Pagina>
  );
}
