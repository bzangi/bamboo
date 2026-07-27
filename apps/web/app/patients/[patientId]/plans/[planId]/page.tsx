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
import { Button } from "@/components/ui/button";
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
import {
  assinaturaItem,
  assinaturaRefeicao,
  assinaturaSemana,
} from "@/lib/lote";
import { explicarFalha, getPlan, listGroups, listPatients } from "@/lib/nutri";
import { salvarTudo } from "../../../../acoes";
import {
  flexTexto,
  flexValor,
  Flexibilidade,
  Original,
  Quantidade,
  Remover,
} from "./campos";
import {
  NovasOpcoes,
  NovasRefeicoes,
  NovosItens,
  NovosTiposDeDia,
} from "./novos";
import { SalvarComRevisao } from "./revisao";
import { SeletorDeAlimento } from "./seletor";

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

function ItemEdicao({
  item,
  grupos,
  onde,
}: {
  item: PlanoItemDto;
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
        <Label htmlFor={`${k}.foodId`}>Alimento</Label>
        <SeletorDeAlimento
          name={`${k}.foodId`}
          inicial={{ id: item.foodId, nome: item.foodName }}
          rotulo={aqui}
          grupo={item.id}
          obrigatorio
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

function Opcao({
  opcao,
  mealId,
  editando,
  grupos,
  onde,
  padraoAtual,
}: {
  opcao: PlanoOpcaoDto;
  mealId: string;
  editando: boolean;
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
              <ItemEdicao key={i.id} item={i} grupos={grupos} onde={aqui} />
            ) : (
              <ItemLeitura key={i.id} item={i} />
            ),
          )}
        </ul>
      )}

      {editando && (
        <NovosItens
          prefixo={`novo-item.${opcao.id}`}
          grupos={grupos}
          onde={aqui}
        />
      )}
    </div>
  );
}

/* ═══════════ refeição ═══════════ */

function Refeicao({
  refeicao,
  editando,
  grupos,
}: {
  refeicao: PlanoRefeicaoDto;
  editando: boolean;
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
            grupos={grupos}
            onde={refeicao.name}
            padraoAtual={padrao?.label ?? ""}
          />
        ))}

        {editando && (
          <NovasOpcoes
            mealId={refeicao.id}
            nomeDaRefeicao={refeicao.name}
            grupos={grupos}
          />
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
  let grupos: ReadonlyArray<GrupoDto> = [];
  try {
    plano = await getPlan(planId);
    paciente = findPatient((await listPatients()).patients, patientId);
    // Os grupos são ~7 e alimentam o controle de flexibilidade. O CATÁLOGO não
    // vem mais aqui: o seletor de alimento busca sob demanda (`seletor.tsx`), o
    // que tirou ~590 `<option>` de cada campo da página.
    if (editando) grupos = (await listGroups()).groups;
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
            <div className="border-t border-dashed border-border pt-3">
              <NovosTiposDeDia />
            </div>
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
                <NovasRefeicoes
                  nomeDoTipo={selecionado.name}
                  primeiraPosicao={selecionado.meals.length + 1}
                />
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
