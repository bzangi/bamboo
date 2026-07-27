// Popula um paciente com acompanhamento de DEMONSTRAÇÃO: plano, ciclo aberto e
// algumas semanas de registro — o que a tela `/patients/:id` precisa para deixar
// de dizer "Sem ciclo de acompanhamento".
//
// Uso: node --env-file=.env --import tsx packages/db/scripts/demo-acompanhamento.ts "João da Silva"
//      …                                                                    "João da Silva" --limpar
//
// NÃO é seed nem fixture de teste: é dado de vitrine, para olhar a tela. O
// `buildScenario` (013) não serve aqui — a invariante I-3 dele é criar paciente
// PRÓPRIO, e o pedido é justamente popular um paciente que já existe, criado
// pela tela.
//
// DETERMINÍSTICO: o sorteio dos dias usa um PRNG com semente derivada do nome do
// paciente, então rodar duas vezes produz exatamente o mesmo retrato. Sem isso,
// "os números mudaram" nunca distinguiria mudança de código de novo sorteio.
//
// IDEMPOTENTE: reaproveita plano e ciclo abertos que já existam, e apaga os
// eventos que ELE mesmo teria escrito (os do paciente dentro da janela) antes de
// reescrever. `--limpar` desfaz tudo o que o script criou para este paciente.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../src/client.js";
import * as schema from "../src/schema.js";

const DURACAO_DIAS = 30;
/** O ciclo começou há tanto tempo: 4 semanas cheias + 3 dias, para a tela ter
 *  uma semana parcial no fim — que é o caso que a barra de largura variável
 *  existe para mostrar. */
const INICIO_DIAS_ATRAS = 31;

/** Data-calendário LOCAL, a mesma convenção de `localToday` na API. Nunca UTC:
 *  meia-noite UTC renderiza o dia anterior a oeste de Greenwich. */
function localDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function weekdayDe(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getDay();
}

/** PRNG mulberry32 com semente do nome — 8 linhas, e o retrato para de mudar a
 *  cada rodada. `Math.random` aqui tornaria o script impossível de conferir. */
function prng(semente: string): () => number {
  let h = 2166136261;
  for (const ch of semente) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const exigir = <T>(v: T | undefined | null, oQue: string): T => {
  if (v === undefined || v === null) throw new Error(`demo: ${oQue}`);
  return v;
};

/* ═══════════ clonagem do grafo do plano ═══════════ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Copia `plan → day_type → meal → meal_option → meal_item` + `day_schedule` de
 * um paciente para outro. Clonar em vez de inventar um plano: o grafo de origem
 * é um plano real, com kcal reais da TACO, e é isso que faz os números da tela
 * serem plausíveis em vez de decorativos.
 */
async function clonarPlano(
  tx: Tx,
  planoOrigemId: string,
  pacienteDestinoId: string,
  nome: string,
): Promise<string> {
  const [novo] = await tx
    .insert(schema.plan)
    .values({ patientId: pacienteDestinoId, name: nome, isActive: true })
    .returning({ id: schema.plan.id });
  const planId = exigir(novo, "falha ao criar o plano").id;

  const tipos = await tx
    .select()
    .from(schema.dayType)
    .where(eq(schema.dayType.planId, planoOrigemId))
    .orderBy(asc(schema.dayType.name), asc(schema.dayType.id));

  const tipoNovoPorAntigo = new Map<string, string>();
  for (const t of tipos) {
    const [ins] = await tx
      .insert(schema.dayType)
      .values({ planId, name: t.name })
      .returning({ id: schema.dayType.id });
    tipoNovoPorAntigo.set(t.id, exigir(ins, "day_type").id);
  }

  const refeicoes = tipos.length
    ? await tx
        .select()
        .from(schema.meal)
        .where(
          inArray(
            schema.meal.dayTypeId,
            tipos.map((t) => t.id),
          ),
        )
        .orderBy(asc(schema.meal.position), asc(schema.meal.id))
    : [];

  const refNovaPorAntiga = new Map<string, string>();
  for (const m of refeicoes) {
    const [ins] = await tx
      .insert(schema.meal)
      .values({
        dayTypeId: exigir(tipoNovoPorAntigo.get(m.dayTypeId), "tipo-de-dia"),
        name: m.name,
        position: m.position,
        horario: m.horario,
      })
      .returning({ id: schema.meal.id });
    refNovaPorAntiga.set(m.id, exigir(ins, "meal").id);
  }

  const opcoes = refeicoes.length
    ? await tx
        .select()
        .from(schema.mealOption)
        .where(
          inArray(
            schema.mealOption.mealId,
            refeicoes.map((m) => m.id),
          ),
        )
        .orderBy(asc(schema.mealOption.label), asc(schema.mealOption.id))
    : [];

  const opcaoNovaPorAntiga = new Map<string, string>();
  for (const o of opcoes) {
    const [ins] = await tx
      .insert(schema.mealOption)
      .values({
        mealId: exigir(refNovaPorAntiga.get(o.mealId), "refeição"),
        label: o.label,
        isDefault: o.isDefault,
      })
      .returning({ id: schema.mealOption.id });
    opcaoNovaPorAntiga.set(o.id, exigir(ins, "meal_option").id);
  }

  const itens = opcoes.length
    ? await tx
        .select()
        .from(schema.mealItem)
        .where(
          inArray(
            schema.mealItem.mealOptionId,
            opcoes.map((o) => o.id),
          ),
        )
    : [];

  for (const it of itens) {
    await tx.insert(schema.mealItem).values({
      mealOptionId: exigir(opcaoNovaPorAntiga.get(it.mealOptionId), "opção"),
      foodId: it.foodId,
      quantityGrams: it.quantityGrams,
      isLocked: it.isLocked,
      substitutionGroupId: it.substitutionGroupId,
      adLibitum: it.adLibitum,
    });
  }

  const semana = await tx
    .select()
    .from(schema.daySchedule)
    .where(eq(schema.daySchedule.planId, planoOrigemId));

  for (const d of semana) {
    await tx.insert(schema.daySchedule).values({
      planId,
      weekday: d.weekday,
      dayTypeId: exigir(tipoNovoPorAntigo.get(d.dayTypeId), "tipo-de-dia"),
    });
  }

  return planId;
}

/* ═══════════ o roteiro do dia ═══════════ */

/** Perfis com pesos: a tela só é útil se houver variedade — dia cheio, dia com
 *  troca, dia com refeição pulada e dia sem registro nenhum (que é o que a
 *  hachura de "sem registro" existe para mostrar). */
type Perfil = "cheio" | "trocou" | "pulou" | "parcial" | "vazio";
type Pesos = ReadonlyArray<readonly [Perfil, number]>;

const PESOS: Pesos = [
  ["cheio", 0.38],
  ["trocou", 0.24],
  ["pulou", 0.14],
  ["parcial", 0.12],
  ["vazio", 0.12],
];

/** O ciclo anterior foi pior: mais dia largado no meio e mais dia sem registro.
 *  É o que faz o delta do ciclo atual ser positivo — e a tela mostrar a cor de
 *  "melhorou", que é o estado que a nutri quer reconhecer de longe. */
const PESOS_ANTERIOR: Pesos = [
  ["cheio", 0.22],
  ["trocou", 0.18],
  ["pulou", 0.22],
  ["parcial", 0.18],
  ["vazio", 0.2],
];

function sortearPerfil(r: number, pesos: Pesos): Perfil {
  let acc = 0;
  for (const [p, peso] of pesos) {
    acc += peso;
    if (r < acc) return p;
  }
  return "cheio";
}

/** Quantos dias atrás está esta data-calendário. Positivo = passado. */
function diasEntre(iso: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${localDate(0)}T00:00:00`) - Date.parse(`${iso}T00:00:00`)) /
        86_400_000,
    ),
  );
}

type ContextoDoPlano = {
  readonly patientId: string;
  readonly planId: string;
  readonly tipoPorWeekday: ReadonlyMap<number, string>;
  readonly refeicoes: ReadonlyArray<{
    readonly id: string;
    readonly dayTypeId: string;
    readonly position: number;
  }>;
  readonly opcoesPorRefeicao: ReadonlyMap<
    string,
    ReadonlyArray<{ readonly id: string; readonly isDefault: boolean }>
  >;
};

/** Escreve os registros de uma janela [deDiasAtras … ateDiasAtras], do mais
 *  antigo para o mais recente. Devolve quantos escreveu. */
async function gerarEventos(
  tx: Tx,
  ctx: ContextoDoPlano,
  deDiasAtras: number,
  ateDiasAtras: number,
  rnd: () => number,
  pesos: Pesos,
): Promise<number> {
  let escritos = 0;
  for (let atras = deDiasAtras; atras >= ateDiasAtras; atras--) {
    const dia = localDate(atras);
    const tipoId = ctx.tipoPorWeekday.get(weekdayDe(dia));
    if (!tipoId) continue;

    const doDia = ctx.refeicoes.filter((m) => m.dayTypeId === tipoId);
    if (doDia.length === 0) continue;

    const perfil = sortearPerfil(rnd(), pesos);
    if (perfil === "vazio") continue;

    // Uma refeição sorteada carrega o desvio do dia; as outras são "feito".
    const alvo = Math.floor(rnd() * doDia.length);

    for (const [i, m] of doDia.entries()) {
      // "parcial" = o paciente registrou só o começo do dia e largou.
      if (perfil === "parcial" && i > Math.floor(doDia.length / 2)) break;

      const desta = i === alvo;
      const lista = ctx.opcoesPorRefeicao.get(m.id) ?? [];
      const padrao = lista.find((o) => o.isDefault) ?? lista[0];
      const alternativa = lista.find((o) => o.id !== padrao?.id);

      let state: "feito" | "troquei" | "pulei" = "feito";
      let opcaoId = padrao?.id ?? null;

      if (desta && perfil === "pulou") {
        state = "pulei";
        opcaoId = null;
      } else if (desta && perfil === "trocou" && alternativa) {
        state = "troquei";
        opcaoId = alternativa.id;
      }

      await tx.insert(schema.mealEvent).values({
        patientId: ctx.patientId,
        planId: ctx.planId,
        mealId: m.id,
        dayTypeId: tipoId,
        chosenMealOptionId: opcaoId,
        state,
        loggedDate: dia,
      });
      escritos++;
    }
  }
  return escritos;
}

/* ═══════════ main ═══════════ */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limpar = args.includes("--limpar");
  const nomePaciente = args.find((a) => !a.startsWith("--")) ?? "João da Silva";

  const resumo = await db.transaction(async (tx) => {
    /* ─── 1. paciente ─── */
    const [paciente] = await tx
      .select({ id: schema.patient.id, name: schema.patient.name })
      .from(schema.patient)
      .where(eq(schema.patient.name, nomePaciente))
      .orderBy(asc(schema.patient.createdAt), asc(schema.patient.id))
      .limit(1);

    if (!paciente) {
      const todos = await tx
        .select({ name: schema.patient.name })
        .from(schema.patient)
        .orderBy(asc(schema.patient.name));
      throw new Error(
        `demo: nenhum paciente chamado "${nomePaciente}". Existem: ${todos
          .map((p) => `"${p.name}"`)
          .join(", ")}`,
      );
    }

    /* ─── 2. limpeza, quando pedida ─── */
    const planosDoPaciente = await tx
      .select({ id: schema.plan.id, name: schema.plan.name })
      .from(schema.plan)
      .where(eq(schema.plan.patientId, paciente.id))
      .orderBy(asc(schema.plan.createdAt), asc(schema.plan.id));

    if (limpar) {
      await apagarEventos(tx, paciente.id);
      const ciclos = await tx
        .select({ id: schema.cycle.id })
        .from(schema.cycle)
        .where(eq(schema.cycle.patientId, paciente.id));
      if (ciclos.length > 0) {
        await tx.delete(schema.cyclePlanVigencia).where(
          inArray(
            schema.cyclePlanVigencia.cycleId,
            ciclos.map((c) => c.id),
          ),
        );
        await tx
          .delete(schema.cycle)
          .where(eq(schema.cycle.patientId, paciente.id));
      }
      for (const p of planosDoPaciente) {
        if (p.name.startsWith("Demonstração")) await apagarPlano(tx, p.id);
      }
      return {
        paciente: paciente.name,
        limpo: true,
        eventos: 0,
        de: "",
        ate: "",
      };
    }

    /* ─── 3. plano ativo: o que houver, senão um clone ─── */
    let planoAtivo = planosDoPaciente.find((p) => p.id) ?? undefined;
    const [ativo] = await tx
      .select({ id: schema.plan.id, name: schema.plan.name })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, paciente.id),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);
    planoAtivo = ativo;

    if (!planoAtivo) {
      // Origem: qualquer plano de OUTRO paciente que tenha grafo. Preferimos o
      // mais antigo por ser o do seed/carregamento real.
      const candidatos = await tx
        .select({ id: schema.plan.id, name: schema.plan.name })
        .from(schema.plan)
        .orderBy(asc(schema.plan.createdAt), asc(schema.plan.id));

      let origemId: string | undefined;
      for (const c of candidatos) {
        const [t] = await tx
          .select({ id: schema.dayType.id })
          .from(schema.dayType)
          .where(eq(schema.dayType.planId, c.id))
          .limit(1);
        if (t) {
          origemId = c.id;
          break;
        }
      }
      if (!origemId) {
        throw new Error(
          "demo: não há nenhum plano com grafo no banco para clonar — rode o seed ou o carregar.ts primeiro",
        );
      }
      const planId = await clonarPlano(
        tx,
        origemId,
        paciente.id,
        `Demonstração — acompanhamento`,
      );
      planoAtivo = { id: planId, name: "Demonstração — acompanhamento" };
    }

    /* ─── 4. dois ciclos: o anterior FECHADO e o atual ABERTO ───
     *
     * O anterior não é enfeite: sem ele o relatório devolve `comparativo: null`
     * e a seção de deltas — que é a que responde "melhorou?" — some da tela. Ele
     * é gerado com a mão mais pesada (ver PESOS_ANTERIOR), então o delta do
     * ciclo atual sai positivo, que é o caso interessante de olhar. */
    const inicio = localDate(INICIO_DIAS_ATRAS);
    const [cicloAberto] = await tx
      .select({ id: schema.cycle.id, startedOn: schema.cycle.startedOn })
      .from(schema.cycle)
      .where(
        and(
          eq(schema.cycle.patientId, paciente.id),
          isNull(schema.cycle.closedOn),
        ),
      )
      .limit(1);

    let cicloInicio: string;
    if (cicloAberto) {
      cicloInicio = cicloAberto.startedOn;
    } else {
      const [c] = await tx
        .insert(schema.cycle)
        .values({
          patientId: paciente.id,
          startedOn: inicio,
          expectedDurationDays: DURACAO_DIAS,
        })
        .returning({ id: schema.cycle.id });
      cicloInicio = inicio;
      await tx.insert(schema.cyclePlanVigencia).values({
        cycleId: exigir(c, "ciclo").id,
        planId: planoAtivo.id,
        validFrom: inicio,
      });
    }

    // O anterior fecha NA véspera do início do atual: é assim que
    // `encontrarCicloAnterior` o acha (closedOn mais recente ≤ startedOn).
    const anteriorFim = localDate(diasEntre(cicloInicio) + 1);
    const anteriorInicio = localDate(diasEntre(cicloInicio) + DURACAO_DIAS);
    const [jaTemAnterior] = await tx
      .select({ id: schema.cycle.id })
      .from(schema.cycle)
      .where(
        and(
          eq(schema.cycle.patientId, paciente.id),
          eq(schema.cycle.startedOn, anteriorInicio),
        ),
      )
      .limit(1);

    if (!jaTemAnterior) {
      const [c] = await tx
        .insert(schema.cycle)
        .values({
          patientId: paciente.id,
          startedOn: anteriorInicio,
          closedOn: anteriorFim,
          expectedDurationDays: DURACAO_DIAS,
        })
        .returning({ id: schema.cycle.id });
      await tx.insert(schema.cyclePlanVigencia).values({
        cycleId: exigir(c, "ciclo anterior").id,
        planId: planoAtivo.id,
        validFrom: anteriorInicio,
        validTo: anteriorFim,
      });
    }

    /* ─── 5. o grafo do plano, para saber o que registrar em cada dia ─── */
    const semana = await tx
      .select()
      .from(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, planoAtivo.id));
    if (semana.length === 0) {
      throw new Error(
        `demo: o plano ativo de ${paciente.name} não tem semana programada (day_schedule) — sem isso não há tipo-de-dia por data`,
      );
    }
    const tipoPorWeekday = new Map(semana.map((d) => [d.weekday, d.dayTypeId]));

    const refeicoes = await tx
      .select({
        id: schema.meal.id,
        dayTypeId: schema.meal.dayTypeId,
        position: schema.meal.position,
      })
      .from(schema.meal)
      .where(
        inArray(schema.meal.dayTypeId, [
          ...new Set(semana.map((d) => d.dayTypeId)),
        ]),
      )
      .orderBy(asc(schema.meal.position), asc(schema.meal.id));

    const opcoes = await tx
      .select()
      .from(schema.mealOption)
      .where(
        inArray(
          schema.mealOption.mealId,
          refeicoes.map((m) => m.id),
        ),
      )
      .orderBy(asc(schema.mealOption.label), asc(schema.mealOption.id));

    const opcoesPorRefeicao = new Map<string, typeof opcoes>();
    for (const o of opcoes) {
      const lista = opcoesPorRefeicao.get(o.mealId) ?? [];
      lista.push(o);
      opcoesPorRefeicao.set(o.mealId, lista);
    }

    /* ─── 6. os eventos das duas janelas ─── */
    await apagarEventos(tx, paciente.id);

    const contexto = {
      patientId: paciente.id,
      planId: planoAtivo.id,
      tipoPorWeekday,
      refeicoes,
      opcoesPorRefeicao,
    };

    // Duas sementes distintas: com a mesma, as duas janelas sorteariam a MESMA
    // sequência de perfis e o comparativo compararia um ciclo com sua cópia.
    const anteriores = await gerarEventos(
      tx,
      contexto,
      diasEntre(anteriorInicio),
      diasEntre(anteriorFim),
      prng(`${paciente.name}#anterior`),
      PESOS_ANTERIOR,
    );
    const atuais = await gerarEventos(
      tx,
      contexto,
      diasEntre(cicloInicio),
      0,
      prng(`${paciente.name}#atual`),
      PESOS,
    );

    return {
      paciente: paciente.name,
      limpo: false,
      eventos: anteriores + atuais,
      de: cicloInicio,
      ate: localDate(0),
      anteriorDe: anteriorInicio,
      anteriorAte: anteriorFim,
      plano: planoAtivo.name,
    };
  });

  if (resumo.limpo) {
    console.log(`demo: acompanhamento de ${resumo.paciente} apagado.`);
  } else {
    console.log(
      `demo: ${resumo.paciente} — plano "${resumo.plano}"\n` +
        `      ciclo anterior (fechado) ${resumo.anteriorDe} → ${resumo.anteriorAte}\n` +
        `      ciclo atual (aberto)     ${resumo.de} → ${resumo.ate}\n` +
        `      ${resumo.eventos} registros nas duas janelas.`,
    );
  }
  process.exit(0);
}

/** Apaga `meal_event_item` antes de `meal_event` (ordem reversa de FK). */
async function apagarEventos(tx: Tx, patientId: string): Promise<void> {
  const eventos = await tx
    .select({ id: schema.mealEvent.id })
    .from(schema.mealEvent)
    .where(eq(schema.mealEvent.patientId, patientId));
  if (eventos.length === 0) return;
  await tx.delete(schema.mealEventItem).where(
    inArray(
      schema.mealEventItem.mealEventId,
      eventos.map((e) => e.id),
    ),
  );
  await tx
    .delete(schema.mealEvent)
    .where(eq(schema.mealEvent.patientId, patientId));
}

/** Apaga o grafo de um plano, de baixo para cima. */
async function apagarPlano(tx: Tx, planId: string): Promise<void> {
  const tipos = await tx
    .select({ id: schema.dayType.id })
    .from(schema.dayType)
    .where(eq(schema.dayType.planId, planId));
  const tipoIds = tipos.map((t) => t.id);

  const refs = tipoIds.length
    ? await tx
        .select({ id: schema.meal.id })
        .from(schema.meal)
        .where(inArray(schema.meal.dayTypeId, tipoIds))
    : [];
  const refIds = refs.map((m) => m.id);

  const ops = refIds.length
    ? await tx
        .select({ id: schema.mealOption.id })
        .from(schema.mealOption)
        .where(inArray(schema.mealOption.mealId, refIds))
    : [];
  const opIds = ops.map((o) => o.id);

  if (opIds.length)
    await tx
      .delete(schema.mealItem)
      .where(inArray(schema.mealItem.mealOptionId, opIds));
  if (refIds.length)
    await tx
      .delete(schema.mealOption)
      .where(inArray(schema.mealOption.mealId, refIds));
  await tx
    .delete(schema.daySchedule)
    .where(eq(schema.daySchedule.planId, planId));
  if (tipoIds.length)
    await tx.delete(schema.meal).where(inArray(schema.meal.dayTypeId, tipoIds));
  await tx.delete(schema.dayType).where(eq(schema.dayType.planId, planId));
  await tx.delete(schema.plan).where(eq(schema.plan.id, planId));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
