// O EDITOR DE PLANO (017 / US3+US5): a tela em que a nutri monta
// `tipo-de-dia → refeição → opção → item` e programa a semana.
//
// Uma leitura para o grafo inteiro (`getPlan`), duas para o catálogo. Toda escrita
// é Server Action; nenhum componente client, nenhum estado no navegador.
//
// Mostra UM tipo-de-dia por vez (`?dayType=`): é o que mantém o número de
// formulários "adicionar item" na página em ~4–8 em vez do plano inteiro, e com
// isso o `<select>` nativo com ~590 alimentos cabe (plan.md/D9).
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
  explicarFalha,
  getPlan,
  listGroups,
  listPatients,
  searchFoods,
} from "@/lib/nutri";
import {
  criarItem,
  criarOpcao,
  criarRefeicao,
  criarTipoDia,
  editarItem,
  editarOpcao,
  editarRefeicao,
  excluirItem,
  excluirOpcao,
  excluirRefeicao,
  excluirTipoDia,
  renomearTipoDia,
  salvarSemana,
  tornarPadrao,
} from "../../../../acoes";

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

/* ═══════════ pedaços de formulário ═══════════ */

/** Os campos ocultos que todo formulário do editor carrega: é deles que a ação
 *  deriva para onde voltar (e não de um campo de destino, que seria
 *  open-redirect de graça). */
function Contexto({
  patientId,
  planId,
  dayTypeId,
}: {
  patientId: string;
  planId: string;
  dayTypeId?: string;
}) {
  return (
    <>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="planId" value={planId} />
      {dayTypeId !== undefined && (
        <input type="hidden" name="dayTypeId" value={dayTypeId} />
      )}
    </>
  );
}

/**
 * A marcação de flexibilidade como UM controle de três formas: livre, travado, ou
 * flexível dentro de um grupo. Dois controles separados (`isLocked` + grupo)
 * permitiriam a combinação que a API recusa com 400 — aqui ela é inexpressável.
 */
function Flexibilidade({
  id,
  grupos,
  item,
}: {
  id: string;
  grupos: ReadonlyArray<GrupoDto>;
  item?: PlanoItemDto;
}) {
  const atual = item?.isLocked ? "travado" : (item?.substitutionGroupId ?? "");
  return (
    <Select id={id} name="flex" defaultValue={atual} className="w-56">
      <option value="">Flexível, sem grupo</option>
      <option value="travado">Travado (não troca)</option>
      {grupos.map((g) => (
        <option key={g.id} value={g.id}>
          Troca dentro de: {g.name}
        </option>
      ))}
    </Select>
  );
}

function CampoAlimento({
  id,
  foods,
  atual,
}: {
  id: string;
  foods: ReadonlyArray<FoodDto>;
  atual?: string;
}) {
  return (
    <Select
      id={id}
      name="foodId"
      defaultValue={atual ?? ""}
      required
      className="w-full min-w-64"
    >
      <option value="" disabled>
        Escolha o alimento…
      </option>
      {foods.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </Select>
  );
}

/* ═══════════ item ═══════════ */

function Item({
  item,
  optionId,
  ctx,
  foods,
  grupos,
}: {
  item: PlanoItemDto;
  optionId: string;
  ctx: { patientId: string; planId: string; dayTypeId: string };
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
}) {
  return (
    <li className="flex flex-wrap items-end gap-2 border-t border-border px-3 py-2">
      <form
        className="flex flex-1 flex-wrap items-end gap-2"
        action={editarItem}
      >
        <Contexto {...ctx} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="optionId" value={optionId} />

        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <Label htmlFor={`food-${item.id}`}>Alimento</Label>
          <CampoAlimento
            id={`food-${item.id}`}
            foods={foods}
            atual={item.foodId}
          />
        </div>
        <div className="flex w-24 flex-col gap-1">
          <Label htmlFor={`g-${item.id}`}>Gramas</Label>
          <Input
            id={`g-${item.id}`}
            name="quantityGrams"
            type="number"
            step="1"
            min="1"
            max="5000"
            defaultValue={item.quantityGrams}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`flex-${item.id}`}>Flexibilidade</Label>
          <Flexibilidade id={`flex-${item.id}`} grupos={grupos} item={item} />
        </div>
        <Button variant="outline" size="sm" type="submit">
          Salvar
        </Button>
      </form>
      <form action={excluirItem}>
        <Contexto {...ctx} />
        <input type="hidden" name="itemId" value={item.id} />
        <Button variant="destructive" size="sm" type="submit">
          Remover
        </Button>
      </form>
    </li>
  );
}

/* ═══════════ opção ═══════════ */

function Opcao({
  opcao,
  ctx,
  foods,
  grupos,
}: {
  opcao: PlanoOpcaoDto;
  ctx: { patientId: string; planId: string; dayTypeId: string };
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
}) {
  return (
    <div className="rounded-sm border border-border">
      <div className="flex flex-wrap items-end justify-between gap-2 bg-muted/60 px-3 py-2">
        <form className="flex flex-wrap items-end gap-2" action={editarOpcao}>
          <Contexto {...ctx} />
          <input type="hidden" name="optionId" value={opcao.id} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`op-${opcao.id}`}>Opção</Label>
            <Input
              id={`op-${opcao.id}`}
              name="label"
              defaultValue={opcao.label}
              maxLength={120}
              required
              className="w-56"
              autoComplete="off"
            />
          </div>
          <Button variant="outline" size="sm" type="submit">
            Renomear
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {opcao.isDefault ? (
            <Badge variant="feito">padrão</Badge>
          ) : (
            <form action={tornarPadrao}>
              <Contexto {...ctx} />
              <input type="hidden" name="optionId" value={opcao.id} />
              <Button variant="ghost" size="xs" type="submit">
                Tornar padrão
              </Button>
            </form>
          )}
          <form action={excluirOpcao}>
            <Contexto {...ctx} />
            <input type="hidden" name="optionId" value={opcao.id} />
            <Button variant="destructive" size="xs" type="submit">
              Excluir opção
            </Button>
          </form>
        </div>
      </div>

      {opcao.items.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-sm text-subtle">
          Nenhum alimento nesta opção.
        </p>
      ) : (
        <ul>
          {opcao.items.map((i) => (
            <Item
              key={i.id}
              item={i}
              optionId={opcao.id}
              ctx={ctx}
              foods={foods}
              grupos={grupos}
            />
          ))}
        </ul>
      )}

      <details className="border-t border-dashed border-border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          + alimento
        </summary>
        <form
          className="flex flex-wrap items-end gap-2 border-t border-border px-3 py-2"
          action={criarItem}
        >
          <Contexto {...ctx} />
          <input type="hidden" name="optionId" value={opcao.id} />
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <Label htmlFor={`novo-food-${opcao.id}`}>Alimento</Label>
            <CampoAlimento id={`novo-food-${opcao.id}`} foods={foods} />
          </div>
          <div className="flex w-24 flex-col gap-1">
            <Label htmlFor={`novo-g-${opcao.id}`}>Gramas</Label>
            <Input
              id={`novo-g-${opcao.id}`}
              name="quantityGrams"
              type="number"
              step="1"
              min="1"
              max="5000"
              required
              placeholder="100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`novo-flex-${opcao.id}`}>Flexibilidade</Label>
            <Flexibilidade id={`novo-flex-${opcao.id}`} grupos={grupos} />
          </div>
          <Button size="sm" type="submit">
            Adicionar
          </Button>
        </form>
      </details>
    </div>
  );
}

/* ═══════════ refeição ═══════════ */

function Refeicao({
  refeicao,
  ctx,
  foods,
  grupos,
}: {
  refeicao: PlanoRefeicaoDto;
  ctx: { patientId: string; planId: string; dayTypeId: string };
  foods: ReadonlyArray<FoodDto>;
  grupos: ReadonlyArray<GrupoDto>;
}) {
  return (
    <Card>
      <CardHeader>
        <form
          className="flex flex-wrap items-end gap-2"
          action={editarRefeicao}
        >
          <Contexto {...ctx} />
          <input type="hidden" name="mealId" value={refeicao.id} />
          <div className="flex w-16 flex-col gap-1">
            <Label htmlFor={`pos-${refeicao.id}`}>Pos.</Label>
            <Input
              id={`pos-${refeicao.id}`}
              name="position"
              type="number"
              step="1"
              min="1"
              max="30"
              defaultValue={refeicao.position}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`nome-${refeicao.id}`}>Refeição</Label>
            <Input
              id={`nome-${refeicao.id}`}
              name="name"
              defaultValue={refeicao.name}
              maxLength={120}
              required
              className="w-56"
              autoComplete="off"
            />
          </div>
          <div className="flex w-32 flex-col gap-1">
            <Label htmlFor={`hora-${refeicao.id}`}>Horário</Label>
            <Input
              id={`hora-${refeicao.id}`}
              name="horario"
              type="time"
              defaultValue={refeicao.horario?.slice(0, 5) ?? ""}
            />
          </div>
          <Button variant="outline" size="sm" type="submit">
            Salvar
          </Button>
        </form>

        <form action={excluirRefeicao}>
          <Contexto {...ctx} />
          <input type="hidden" name="mealId" value={refeicao.id} />
          <Button variant="destructive" size="sm" type="submit">
            Excluir refeição
          </Button>
        </form>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {refeicao.options.length === 0 && (
          <p className="text-sm text-subtle">
            Sem opção nenhuma — o app do paciente não tem o que mostrar nesta
            refeição. Crie a primeira abaixo.
          </p>
        )}
        {refeicao.options.map((o) => (
          <Opcao key={o.id} opcao={o} ctx={ctx} foods={foods} grupos={grupos} />
        ))}

        <form
          className="flex flex-wrap items-end gap-2 border-t border-dashed border-border pt-3"
          action={criarOpcao}
        >
          <Contexto {...ctx} />
          <input type="hidden" name="mealId" value={refeicao.id} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`nova-op-${refeicao.id}`}>Nova opção</Label>
            <Input
              id={`nova-op-${refeicao.id}`}
              name="label"
              maxLength={120}
              required
              className="w-56"
              autoComplete="off"
              placeholder="Arroz e carne"
            />
          </div>
          <Button variant="outline" size="sm" type="submit">
            Adicionar opção
          </Button>
        </form>
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
  searchParams: Promise<{ dayType?: string; erro?: string }>;
}) {
  const { patientId, planId } = await params;
  const { dayType, erro } = await searchParams;

  let plano: PlanoDto;
  let paciente: NutriPatientDto | undefined;
  let foods: ReadonlyArray<FoodDto>;
  let grupos: ReadonlyArray<GrupoDto>;
  try {
    plano = await getPlan(planId);
    paciente = findPatient((await listPatients()).patients, patientId);
    // Catálogo inteiro numa tacada: alimenta os `<select>` nativos, que dão
    // type-ahead do navegador de graça e funcionam sem JavaScript.
    foods = (await searchFoods("", 600)).foods;
    grupos = (await listGroups()).groups;
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
  const semanaPorDia = new Map(plano.week.map((d) => [d.weekday, d.dayTypeId]));

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
            <Link href={`/patients/${patientId}/plans`}>
              <Button variant="outline" size="sm">
                Todos os planos
              </Button>
            </Link>
          </div>
        }
      />

      <Aviso codigo={erro} />

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
              Nenhum tipo-de-dia. Crie o primeiro abaixo — sem ele não há onde
              pôr refeição.
            </p>
          )}
          {tipos.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <form
                className="flex flex-wrap items-end gap-2"
                action={renomearTipoDia}
              >
                <Contexto
                  patientId={patientId}
                  planId={planId}
                  dayTypeId={t.id}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`dt-${t.id}`}>Nome</Label>
                  <Input
                    id={`dt-${t.id}`}
                    name="name"
                    defaultValue={t.name}
                    maxLength={120}
                    required
                    className="w-56"
                    autoComplete="off"
                  />
                </div>
                <Button variant="outline" size="sm" type="submit">
                  Renomear
                </Button>
              </form>
              <div className="flex items-center gap-2">
                <Mono className="text-subtle">
                  {t.meals.length}{" "}
                  {t.meals.length === 1 ? "refeição" : "refeições"}
                </Mono>
                <form action={excluirTipoDia}>
                  <Contexto
                    patientId={patientId}
                    planId={planId}
                    dayTypeId={t.id}
                  />
                  <Button variant="destructive" size="sm" type="submit">
                    Excluir
                  </Button>
                </form>
              </div>
            </div>
          ))}

          <form
            className="flex flex-wrap items-end gap-2 border-t border-dashed border-border pt-3"
            action={criarTipoDia}
          >
            <Contexto patientId={patientId} planId={planId} />
            <div className="flex flex-col gap-1">
              <Label htmlFor="novo-tipo">Novo tipo-de-dia</Label>
              <Input
                id="novo-tipo"
                name="name"
                maxLength={120}
                required
                className="w-56"
                autoComplete="off"
                placeholder="Treino"
              />
            </div>
            <Button size="sm" type="submit">
              Criar
            </Button>
          </form>
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
            <form className="flex flex-col gap-3" action={salvarSemana}>
              <Contexto
                patientId={patientId}
                planId={planId}
                dayTypeId={selecionado?.id ?? ""}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {DIAS.map((rotulo, weekday) => (
                  <div key={weekday} className="flex flex-col gap-1.5">
                    <Label htmlFor={`d${weekday}`}>{rotulo}</Label>
                    <Select
                      id={`d${weekday}`}
                      name={`d${weekday}`}
                      defaultValue={
                        semanaPorDia.get(weekday) ?? tipos[0]?.id ?? ""
                      }
                      required
                    >
                      {tipos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
              <div>
                <Button type="submit">Salvar a semana</Button>
              </div>
            </form>
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
              <Link key={t.id} href={`${rota}?dayType=${t.id}`}>
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
              Crie a primeira abaixo. A posição é o que pareia esta refeição com
              a de mesmo número nos outros tipos-de-dia — é o que faz a troca de
              tipo-de-dia funcionar.
            </Vazio>
          ) : (
            <div className="flex flex-col gap-4">
              {selecionado.meals.map((m) => (
                <Refeicao
                  key={m.id}
                  refeicao={m}
                  ctx={{ patientId, planId, dayTypeId: selecionado.id }}
                  foods={foods}
                  grupos={grupos}
                />
              ))}
            </div>
          )}

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Nova refeição em {selecionado.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-wrap items-end gap-3"
                action={criarRefeicao}
              >
                <Contexto
                  patientId={patientId}
                  planId={planId}
                  dayTypeId={selecionado.id}
                />
                <div className="flex w-16 flex-col gap-1.5">
                  <Label htmlFor="nova-pos">Pos.</Label>
                  <Input
                    id="nova-pos"
                    name="position"
                    type="number"
                    step="1"
                    min="1"
                    max="30"
                    required
                    defaultValue={selecionado.meals.length + 1}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nova-nome">Nome</Label>
                  <Input
                    id="nova-nome"
                    name="name"
                    maxLength={120}
                    required
                    className="w-56"
                    autoComplete="off"
                    placeholder="Almoço"
                  />
                </div>
                <div className="flex w-32 flex-col gap-1.5">
                  <Label htmlFor="nova-hora">Horário</Label>
                  <Input id="nova-hora" name="horario" type="time" />
                </div>
                <Button type="submit">Criar refeição</Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </Pagina>
  );
}
