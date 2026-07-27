// scenario.ts — construtor de cenário de banco para as suítes e2e e para o seed
// (feature 013). Module DEEP: 3 funções + um handle de 4 membros compram 11
// tabelas, ordem de FK nos dois sentidos, atomicidade, data-calendário local e
// resolução determinística de pré-requisitos.
//
// POR QUE EXISTE: as suítes montavam cenário à mão — 330 linhas de fixture em
// `escopo-plano.e2e-spec.ts`, 234 em `colisao-position.e2e-spec.ts`, 460 em
// `relatorio.e2e-spec.ts`, com `isoDaysAgo` duplicado byte-a-byte em 5 arquivos,
// 6 assinaturas diferentes de inserir `meal_event` e a ordem reversa de FK
// reescrita a cada suíte nova. O sintoma caro: a suíte e2e só passava de segunda
// a sexta e ninguém sabia (KI-004), porque o calendário era um dos detalhes do
// fixture de produção em que as suítes se apoiavam.
//
// ONDE MORA: `packages/db`, não `packages/core` — faz I/O, e o núcleo é TS puro
// (Princípio III). Do mesmo lado de `scripts/seed.ts`, que por isso PODE virar
// chamador. Exportado pelo subpath `@bamboo/db/testing`, NUNCA pelo barril
// `src/index.ts`: não pode virar dependência alcançável do runtime da API.
//
// ═══════════ INVARIANTES — parte da INTERFACE, não da implementation ═════════
// Hoje estes fatos vivem em comentário replicado por suíte. Escritos uma vez,
// viram locality de contrato.
//
// I-1  ORDEM: resolve nutricionista + foods + grupos ANTES do primeiro insert.
//      Spec irresolvível lança SEM ter escrito nada — é o que impede paciente
//      órfão de ser sorteado pelos 12 `from(patient).limit(1)` sem `where` das
//      suítes do apps/api.
// I-2  DETERMINISMO: nutricionista, foods e grupos resolvidos com ORDER BY
//      explícito; food sempre com kcal > 0; apelidos distintos ⇒ foods
//      distintos, ou lança.
// I-3  PACIENTE SEMPRE PRÓPRIO do cenário. Nunca o do seed (lição a2894f3 /
//      KI-001). Este module NÃO resolve paciente semeado — é outro seam.
// I-4  LANÇA em vez de devolver `Result`. Desvio deliberado e adjacente ao
//      Princípio III: a disciplina do `Result` é do NÚCLEO PURO; num construtor
//      de fixture obrigaria um `if (!r.ok) throw` por linha de `beforeAll` e
//      deixaria a interface mais RASA. A mensagem lista os labels existentes.
// I-5  VALIDA antes de inserir: 2 ciclos abertos no mesmo paciente (índice único
//      parcial `cycle_one_active_per_patient`), label duplicado, `position`
//      duplicada num tipo, apelido de food não declarado, item sem `grams` que
//      não é `aVontade` (e o inverso). Erro com mensagem, não erro cru do
//      Postgres.
// I-6  NÃO sobe Nest, NÃO fala HTTP, NÃO chama `pool.end()` (pool singleton).
// I-7  NÃO cria `food` / `substitution_group` / `food_substitution_group` /
//      `food_household_measure` — são pré-requisito com semântica de
//      upsert-com-história (ingestão TACO / `ensureGroups`), não cenário.
// I-8  Tudo readonly; o handle é fechado sobre os próprios ids, então dois
//      cenários no mesmo arquivo não interferem.
// I-9  OBRIGAÇÃO DO CHAMADOR: `await s.destroy()` no `afterAll`.
// ═══════════════════════════════════════════════════════════════════════════

import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "./../client.js";
import * as schema from "./../schema.js";

/* ─────────── seam do executor: dois adapters REAIS ─────────── */

type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `db` (suítes e2e) ou a transação de `db.transaction` (o `seed.ts` já roda
 *  tudo dentro de uma). Dois adapters de verdade, não um hipotético. */
export type Executor = typeof db | DrizzleTx;

/* ═══════════ o valor: spec do cenário ═══════════ */

/** Pré-requisito RESOLVIDO, nunca criado (I-7): foods vêm da ingestão TACO. */
export type FoodQuery = {
  readonly name?: string; // nome exato — o idioma do seed
  readonly minKcalPer100g?: number; // "um qualquer, não degenerado" — o idioma e2e
};

export type ItemSpec = {
  readonly food: string; // apelido declarado em ScenarioSpec.foods
  /** Obrigatório, EXCETO em item `aVontade` (018), que não tem quantidade
   *  prescrita — declarar gramas ali seria inventar prescrição. */
  readonly grams?: number;
  /** "À vontade" (018): sem quantidade prescrita. Persistido como
   *  `ad_libitum = true` + `quantity_grams = 0`. */
  readonly aVontade?: boolean;
  readonly locked?: boolean; // default false
  readonly group?: string | null; // nome canônico do grupo; default null
};

export type OptionSpec = {
  readonly label: string; // rótulo no banco E chave de lookup
  readonly isDefault?: boolean; // default: a primeira opção da refeição
  readonly items: ReadonlyArray<ItemSpec>;
};

export type MealSpec = {
  readonly position: number; // chave de lookup dentro do tipo-de-dia
  readonly name?: string; // default `${label do tipo} pos${position}`
  readonly options: ReadonlyArray<OptionSpec>;
};

export type DayTypeSpec<D extends string = string> = {
  readonly label: D; // único no cenário INTEIRO
  readonly name?: string; // default: label
  readonly meals: ReadonlyArray<MealSpec>;
};

export type PlanSpec<D extends string = string> = {
  readonly label: string; // único no cenário inteiro
  readonly name?: string;
  readonly active?: boolean; // default true
  readonly dayTypes: ReadonlyArray<DayTypeSpec<D>>;
  /** weekday 0-6 → label de tipo. Ausente = sem `day_schedule`.
   *  `everyWeekday('A')` = cenário independente do calendário. */
  readonly schedule?: Readonly<Record<number, D>>;
};

export type PlanWindowSpec = {
  readonly plan: string;
  readonly fromDaysAgo: number;
  readonly toDaysAgo?: number | null; // omitido/null = vigência corrente
};

export type CycleSpec = {
  readonly label: string;
  readonly startedDaysAgo: number;
  readonly closedDaysAgo?: number | null; // omitido/null = ABERTO
  readonly expectedDurationDays: number;
  readonly planWindows?: ReadonlyArray<PlanWindowSpec>;
};

export type PatientSpec<D extends string = string> = {
  readonly label?: string; // default 'principal'
  readonly name?: string;
  readonly exposure?: "hidden" | "percent" | "macros" | "full_kcal";
  /** Pina a RÉGUA no paciente. Sem isso, a calibração de um cenário depende dos
   *  defaults da nutricionista semeada — acoplamento silencioso. */
  readonly bandTolerancePct?: number | null;
  readonly floorPct?: number | null;
  readonly plans?: ReadonlyArray<PlanSpec<D>>;
  readonly cycles?: ReadonlyArray<CycleSpec>;
};

/** Refeição endereçada por (label do tipo-de-dia, position). Plano, paciente e
 *  tipo-de-dia do evento são DERIVADOS — labels são únicos no cenário. */
export type MealRef<D extends string = string> = {
  readonly dayType: D;
  readonly position: number;
};

export type EventSpec<D extends string = string> = {
  readonly meal: MealRef<D>;
  readonly state: "feito" | "troquei" | "pulei" | null; // null = anulação
  readonly daysAgo: number; // 0 = hoje, data-calendário LOCAL
  readonly time?: string; // created_at; default '12:00:00'
  /** label da opção; default = a padrão. Forçado a null em `pulei`/anulação. */
  readonly option?: string;
  readonly id?: string; // uuid explícito (desempate determinístico)
};

export type ScenarioSpec<D extends string = string> = {
  readonly label: string; // prefixo dos nomes gerados (rastreabilidade)
  readonly foods?: Readonly<Record<string, FoodQuery>>;
  readonly patients: ReadonlyArray<PatientSpec<D>>;
  readonly events?: ReadonlyArray<EventSpec<D>>;
};

/* ═══════════ o handle ═══════════ */

export type MealIds = {
  readonly mealId: string;
  readonly defaultOptionId: string;
  /** Lookup por label; LANÇA listando os labels existentes (nunca `map.get(x)!`). */
  option(label: string): string;
};

export type ScenarioIds<D extends string = string> = {
  readonly nutritionistId: string;
  patient(label?: string): string; // omitido = 'principal'
  plan(label: string): string;
  dayType(label: D): string;
  meal(ref: MealRef<D>): MealIds;
  cycle(label: string): string;
  food(alias: string): string;
};

export type Scenario<D extends string = string> = {
  readonly ids: ScenarioIds<D>;
  addEvents(
    events: ReadonlyArray<EventSpec<D>>,
  ): Promise<ReadonlyArray<string>>;
  /** Apaga `meal_event_item` → `meal_event` de TODOS os pacientes do cenário, por
   *  `patientId` — pega também o que a casca escreveu via `POST /registro`. */
  clearEvents(): Promise<void>;
  /** Teardown em ordem reversa de FK, por posse do cenário. Idempotente. */
  destroy(): Promise<void>;
};

/* ═══════════ helpers de valor ═══════════ */

/** Data-calendário LOCAL 'YYYY-MM-DD' — mesma fonte do service
 *  (`local-date.localToday`), nunca UTC. Antes desta função havia 5 cópias
 *  byte-idênticas em 5 arquivos de teste. */
export function localDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo); // incremento de calendário, nunca diff de ms
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Açúcar de valor: `{0: label, …, 6: label}` — o idioma "independente do
 *  calendário" que as suítes self-contained repetiam à mão. */
export function everyWeekday<D extends string>(
  dayTypeLabel: D,
): Readonly<Record<number, D>> {
  return Object.freeze({
    0: dayTypeLabel,
    1: dayTypeLabel,
    2: dayTypeLabel,
    3: dayTypeLabel,
    4: dayTypeLabel,
    5: dayTypeLabel,
    6: dayTypeLabel,
  });
}

/* ═══════════ implementation ═══════════ */

const DEFAULT_PATIENT = "principal";
const DEFAULT_TIME = "12:00:00";

// I-4: erro com mensagem que lista o que existe. Sempre por aqui, nunca `!`.
const exigir = <T>(
  valor: T | undefined,
  oQue: string,
  chave: string | number,
  existentes: ReadonlyArray<string | number>,
): T => {
  if (valor === undefined) {
    throw new Error(
      `cenário: ${oQue} "${chave}" não existe. Existentes: ${existentes.length > 0 ? existentes.join(", ") : "(nenhum)"}`,
    );
  }
  return valor;
};

// `noUncheckedIndexedAccess` está ligado neste package, então destruturar o
// `.returning()` do Drizzle dá `T | undefined`. Um INSERT ... RETURNING que não
// devolve linha é falha de infraestrutura, não caso de domínio — logo lança
// (mesma disciplina do I-4), em vez de propagar `!` por 20 call sites.
const inserido = <T>(rows: ReadonlyArray<T>, oQue: string): T => {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`cenário: INSERT de ${oQue} não devolveu linha`);
  }
  return row;
};

// Chaves internas dos mapas de lookup.
const mealKey = (dayTypeLabel: string, position: number): string =>
  `${dayTypeLabel}|${position}`;

type MealResolvido = {
  readonly mealId: string;
  readonly defaultOptionId: string;
  readonly optionsPorLabel: ReadonlyMap<string, string>;
  readonly dayTypeId: string;
  readonly planId: string;
  readonly patientId: string;
};

/** Valida a spec INTEIRA antes de qualquer insert (I-1/I-5). Pura. */
function validarSpec<D extends string>(spec: ScenarioSpec<D>): void {
  if (spec.patients.length === 0) {
    throw new Error("cenário: `patients` não pode ser vazio");
  }
  const aliasesDeFood = new Set(Object.keys(spec.foods ?? {}));
  const patientLabels = new Set<string>();
  const planLabels = new Set<string>();
  const dayTypeLabels = new Set<string>();
  const cycleLabels = new Set<string>();

  for (const p of spec.patients) {
    const pLabel = p.label ?? DEFAULT_PATIENT;
    if (patientLabels.has(pLabel)) {
      throw new Error(`cenário: label de paciente duplicado: "${pLabel}"`);
    }
    patientLabels.add(pLabel);

    // I-5: o banco garante no máximo 1 ciclo ativo por paciente (índice único
    // parcial `cycle_one_active_per_patient`). Barrar aqui dá mensagem em vez de
    // erro cru do Postgres.
    const abertos = (p.cycles ?? []).filter(
      (c) => c.closedDaysAgo === undefined || c.closedDaysAgo === null,
    );
    if (abertos.length > 1) {
      throw new Error(
        `cenário: paciente "${pLabel}" tem ${abertos.length} ciclos ABERTOS (${abertos.map((c) => c.label).join(", ")}); o banco permite no máximo 1 por paciente`,
      );
    }
    for (const c of p.cycles ?? []) {
      if (cycleLabels.has(c.label)) {
        throw new Error(`cenário: label de ciclo duplicado: "${c.label}"`);
      }
      cycleLabels.add(c.label);
    }

    for (const pl of p.plans ?? []) {
      if (planLabels.has(pl.label)) {
        throw new Error(`cenário: label de plano duplicado: "${pl.label}"`);
      }
      planLabels.add(pl.label);

      for (const dt of pl.dayTypes) {
        if (dayTypeLabels.has(dt.label)) {
          throw new Error(
            `cenário: label de tipo-de-dia duplicado: "${dt.label}" (labels são únicos no cenário INTEIRO — é o que permite derivar plano e paciente de um MealRef)`,
          );
        }
        dayTypeLabels.add(dt.label);

        const positions = new Set<number>();
        for (const m of dt.meals) {
          if (positions.has(m.position)) {
            throw new Error(
              `cenário: position ${m.position} duplicada no tipo-de-dia "${dt.label}"`,
            );
          }
          positions.add(m.position);

          if (m.options.length === 0) {
            throw new Error(
              `cenário: refeição "${dt.label}" pos ${m.position} sem opções`,
            );
          }
          const optLabels = new Set<string>();
          for (const o of m.options) {
            if (optLabels.has(o.label)) {
              throw new Error(
                `cenário: label de opção duplicado "${o.label}" em "${dt.label}" pos ${m.position}`,
              );
            }
            optLabels.add(o.label);
            for (const it of o.items) {
              if (!aliasesDeFood.has(it.food)) {
                throw new Error(
                  `cenário: item referencia apelido de food não declarado: "${it.food}". Declarados: ${[...aliasesDeFood].join(", ") || "(nenhum)"}`,
                );
              }
              // I-5: sem isto, esquecer `grams` inseriria um item NORMAL de 0 g —
              // exatamente o "0 porque bug" que a flag `ad_libitum` existe para
              // distinguir (018).
              if (it.aVontade !== true && typeof it.grams !== "number") {
                throw new Error(
                  `cenário: item "${it.food}" em "${dt.label}" pos ${m.position} sem \`grams\` — obrigatório, exceto em item \`aVontade\``,
                );
              }
              if (it.aVontade === true && it.grams !== undefined) {
                throw new Error(
                  `cenário: item "${it.food}" em "${dt.label}" pos ${m.position} é \`aVontade\` e NÃO pode declarar \`grams\` (não há quantidade prescrita)`,
                );
              }
            }
          }
        }
      }

      // `schedule` só pode apontar para tipos declarados NESTE plano.
      for (const [weekday, label] of Object.entries(pl.schedule ?? {})) {
        if (!pl.dayTypes.some((dt) => dt.label === label)) {
          throw new Error(
            `cenário: schedule do plano "${pl.label}" aponta weekday ${weekday} para o tipo "${label}", que não é declarado nesse plano`,
          );
        }
      }
    }

    for (const c of p.cycles ?? []) {
      for (const w of c.planWindows ?? []) {
        if (!(p.plans ?? []).some((pl) => pl.label === w.plan)) {
          throw new Error(
            `cenário: vigência do ciclo "${c.label}" aponta para o plano "${w.plan}", que não é do paciente "${pLabel}"`,
          );
        }
      }
    }
  }

  for (const e of spec.events ?? []) {
    if (!dayTypeLabels.has(e.meal.dayType)) {
      throw new Error(
        `cenário: evento referencia tipo-de-dia "${e.meal.dayType}", não declarado. Declarados: ${[...dayTypeLabels].join(", ") || "(nenhum)"}`,
      );
    }
  }
}

/** Resolve os PRÉ-REQUISITOS (I-1/I-2): nada é inserido antes disto passar. */
async function resolverPreRequisitos(
  ex: Executor,
  spec: ScenarioSpec<string>,
): Promise<{
  readonly nutritionistId: string;
  readonly foodPorAlias: ReadonlyMap<string, string>;
  readonly grupoPorNome: ReadonlyMap<string, string>;
}> {
  // I-2/I-3: ORDER BY explícito. Este module NÃO cria nutricionista e NÃO
  // resolve paciente semeado (seam diferente).
  const [nutri] = await ex
    .select({ id: schema.nutritionist.id })
    .from(schema.nutritionist)
    .orderBy(asc(schema.nutritionist.id))
    .limit(1);
  if (!nutri) {
    throw new Error(
      "cenário: nenhuma nutricionista no banco — rode o seed antes (o construtor não cria nutricionista)",
    );
  }

  // I-2: apelidos distintos ⇒ foods DISTINTOS. Resolvidos em ordem, cada um
  // excluindo os já escolhidos.
  const foodPorAlias = new Map<string, string>();
  for (const [alias, q] of Object.entries(spec.foods ?? {})) {
    const jaUsados = [...foodPorAlias.values()];
    const filtros = [
      // Nunca degenerado: alvo com 0 kcal esconde bug em cálculo nutricional.
      gt(schema.food.kcalPer100g, q.minKcalPer100g ?? 0),
      ...(q.name ? [eq(schema.food.name, q.name)] : []),
    ];
    const candidatos = await ex
      .select({ id: schema.food.id })
      .from(schema.food)
      .where(and(...filtros))
      .orderBy(asc(schema.food.id));
    const escolhido = candidatos.find((c) => !jaUsados.includes(c.id));
    if (!escolhido) {
      throw new Error(
        `cenário: nenhum food disponível para o apelido "${alias}" (${q.name ? `name="${q.name}"` : `kcal > ${q.minKcalPer100g ?? 0}`}); ${candidatos.length} candidato(s), ${jaUsados.length} já usado(s) por outros apelidos`,
      );
    }
    foodPorAlias.set(alias, escolhido.id);
  }

  // Grupos: resolvidos por nome canônico, nunca criados (I-7).
  const nomesDeGrupo = new Set<string>();
  for (const p of spec.patients) {
    for (const pl of p.plans ?? []) {
      for (const dt of pl.dayTypes) {
        for (const m of dt.meals) {
          for (const o of m.options) {
            for (const it of o.items) {
              if (it.group) nomesDeGrupo.add(it.group);
            }
          }
        }
      }
    }
  }
  const grupoPorNome = new Map<string, string>();
  if (nomesDeGrupo.size > 0) {
    const linhas = await ex
      .select({
        id: schema.substitutionGroup.id,
        name: schema.substitutionGroup.name,
      })
      .from(schema.substitutionGroup)
      .where(inArray(schema.substitutionGroup.name, [...nomesDeGrupo]))
      .orderBy(asc(schema.substitutionGroup.id));
    for (const l of linhas) grupoPorNome.set(l.name, l.id);
    for (const nome of nomesDeGrupo) {
      if (!grupoPorNome.has(nome)) {
        throw new Error(
          `cenário: grupo de substituição "${nome}" não existe no banco (o construtor não cria grupos — rode o seed). Existentes: ${linhas.map((l) => l.name).join(", ") || "(nenhum)"}`,
        );
      }
    }
  }

  return { nutritionistId: nutri.id, foodPorAlias, grupoPorNome };
}

/**
 * Materializa um cenário de banco e devolve o handle com os ids resolvidos.
 *
 * ATÔMICO quando `opts.executor` é omitido: roda tudo em UMA transação, então
 * não existe estado parcial — e o teardown não precisa dos gates
 * `if (ids.length > 0)` que sujavam os `afterAll` escritos à mão.
 *
 * Recebendo um executor (a tx do chamador), usa-a como está, sem savepoint: é o
 * 2º adapter do seam, o que permite ao `seed.ts` virar chamador.
 */
export async function buildScenario<D extends string>(
  spec: ScenarioSpec<D>,
  opts?: { readonly executor?: Executor },
): Promise<Scenario<D>> {
  validarSpec(spec); // I-5, antes de tocar o banco

  const materializar = async (ex: Executor) => {
    const pre = await resolverPreRequisitos(ex, spec); // I-1

    const patientPorLabel = new Map<string, string>();
    const planPorLabel = new Map<string, string>();
    const dayTypePorLabel = new Map<string, string>();
    const cyclePorLabel = new Map<string, string>();
    const mealPorChave = new Map<string, MealResolvido>();

    for (const p of spec.patients) {
      const pLabel = p.label ?? DEFAULT_PATIENT;
      const pat = inserido(
        await ex
          .insert(schema.patient)
          .values({
            nutritionistId: pre.nutritionistId,
            name: p.name ?? `${spec.label} · ${pLabel}`,
            ...(p.exposure ? { exposure: p.exposure } : {}),
            ...(p.bandTolerancePct !== undefined
              ? { bandTolerancePct: p.bandTolerancePct }
              : {}),
            ...(p.floorPct !== undefined ? { floorPct: p.floorPct } : {}),
          })
          .returning({ id: schema.patient.id }),
        "paciente",
      );
      patientPorLabel.set(pLabel, pat.id);

      for (const pl of p.plans ?? []) {
        const plan = inserido(
          await ex
            .insert(schema.plan)
            .values({
              patientId: pat.id,
              name: pl.name ?? `${spec.label} · ${pl.label}`,
              isActive: pl.active ?? true,
            })
            .returning({ id: schema.plan.id }),
          "plano",
        );
        planPorLabel.set(pl.label, plan.id);

        for (const dt of pl.dayTypes) {
          const dayType = inserido(
            await ex
              .insert(schema.dayType)
              .values({ planId: plan.id, name: dt.name ?? dt.label })
              .returning({ id: schema.dayType.id }),
            "tipo-de-dia",
          );
          dayTypePorLabel.set(dt.label, dayType.id);

          for (const m of dt.meals) {
            const meal = inserido(
              await ex
                .insert(schema.meal)
                .values({
                  dayTypeId: dayType.id,
                  name: m.name ?? `${dt.label} pos${m.position}`,
                  position: m.position,
                })
                .returning({ id: schema.meal.id }),
              "refeição",
            );

            const optionsPorLabel = new Map<string, string>();
            let defaultOptionId: string | undefined;
            for (const [idx, o] of m.options.entries()) {
              // Default explícito; senão a PRIMEIRA opção da refeição.
              const isDefault =
                o.isDefault ??
                (m.options.some((x) => x.isDefault) ? false : idx === 0);
              const opt = inserido(
                await ex
                  .insert(schema.mealOption)
                  .values({ mealId: meal.id, label: o.label, isDefault })
                  .returning({ id: schema.mealOption.id }),
                "opção",
              );
              optionsPorLabel.set(o.label, opt.id);
              if (isDefault && defaultOptionId === undefined) {
                defaultOptionId = opt.id;
              }

              if (o.items.length > 0) {
                await ex.insert(schema.mealItem).values(
                  o.items.map((it) => ({
                    mealOptionId: opt.id,
                    foodId: exigir(
                      pre.foodPorAlias.get(it.food),
                      "apelido de food",
                      it.food,
                      [...pre.foodPorAlias.keys()],
                    ),
                    quantityGrams: it.aVontade ? 0 : (it.grams ?? 0),
                    isLocked: it.locked ?? false,
                    adLibitum: it.aVontade ?? false,
                    substitutionGroupId: it.group
                      ? exigir(
                          pre.grupoPorNome.get(it.group),
                          "grupo de substituição",
                          it.group,
                          [...pre.grupoPorNome.keys()],
                        )
                      : null,
                  })),
                );
              }
            }

            mealPorChave.set(mealKey(dt.label, m.position), {
              mealId: meal.id,
              // Validado em `validarSpec`: toda refeição tem ≥1 opção, logo a
              // primeira virou default quando nenhuma foi marcada.
              defaultOptionId: exigir(
                defaultOptionId,
                "opção default de",
                `${dt.label} pos${m.position}`,
                [...optionsPorLabel.keys()],
              ),
              optionsPorLabel,
              dayTypeId: dayType.id,
              planId: plan.id,
              patientId: pat.id,
            });
          }
        }

        const schedule = Object.entries(pl.schedule ?? {});
        if (schedule.length > 0) {
          await ex.insert(schema.daySchedule).values(
            schedule.map(([weekday, label]) => ({
              planId: plan.id,
              weekday: Number(weekday),
              dayTypeId: exigir(
                dayTypePorLabel.get(label),
                "tipo-de-dia",
                label,
                [...dayTypePorLabel.keys()],
              ),
            })),
          );
        }
      }

      for (const c of p.cycles ?? []) {
        const cycle = inserido(
          await ex
            .insert(schema.cycle)
            .values({
              patientId: pat.id,
              startedOn: localDate(c.startedDaysAgo),
              closedOn:
                c.closedDaysAgo === undefined || c.closedDaysAgo === null
                  ? null
                  : localDate(c.closedDaysAgo),
              expectedDurationDays: c.expectedDurationDays,
            })
            .returning({ id: schema.cycle.id }),
          "ciclo",
        );
        cyclePorLabel.set(c.label, cycle.id);

        if ((c.planWindows ?? []).length > 0) {
          await ex.insert(schema.cyclePlanVigencia).values(
            (c.planWindows ?? []).map((w) => ({
              cycleId: cycle.id,
              planId: exigir(planPorLabel.get(w.plan), "plano", w.plan, [
                ...planPorLabel.keys(),
              ]),
              validFrom: localDate(w.fromDaysAgo),
              validTo:
                w.toDaysAgo === undefined || w.toDaysAgo === null
                  ? null
                  : localDate(w.toDaysAgo),
            })),
          );
        }
      }
    }

    return {
      patientPorLabel,
      planPorLabel,
      dayTypePorLabel,
      cyclePorLabel,
      mealPorChave,
      nutritionistId: pre.nutritionistId,
      foodPorAlias: pre.foodPorAlias,
    };
  };

  // Transação PRÓPRIA só quando o executor é omitido (o `seed.ts` já tem a sua).
  const executor = opts?.executor;
  const mat = executor
    ? await materializar(executor)
    : await db.transaction((tx) => materializar(tx));

  // O executor de escrita posterior é o mesmo do build: dentro da tx do
  // chamador, `addEvents`/`destroy` têm de participar dela.
  const ex: Executor = executor ?? db;

  const mealDe = (ref: MealRef<D>): MealResolvido =>
    exigir(
      mat.mealPorChave.get(mealKey(ref.dayType, ref.position)),
      "refeição",
      `${ref.dayType} pos${ref.position}`,
      [...mat.mealPorChave.keys()],
    );

  const ids: ScenarioIds<D> = {
    nutritionistId: mat.nutritionistId,
    patient: (label = DEFAULT_PATIENT) =>
      exigir(mat.patientPorLabel.get(label), "paciente", label, [
        ...mat.patientPorLabel.keys(),
      ]),
    plan: (label) =>
      exigir(mat.planPorLabel.get(label), "plano", label, [
        ...mat.planPorLabel.keys(),
      ]),
    dayType: (label) =>
      exigir(mat.dayTypePorLabel.get(label), "tipo-de-dia", label, [
        ...mat.dayTypePorLabel.keys(),
      ]),
    cycle: (label) =>
      exigir(mat.cyclePorLabel.get(label), "ciclo", label, [
        ...mat.cyclePorLabel.keys(),
      ]),
    food: (alias) =>
      exigir(mat.foodPorAlias.get(alias), "apelido de food", alias, [
        ...mat.foodPorAlias.keys(),
      ]),
    meal: (ref) => {
      const m = mealDe(ref);
      return {
        mealId: m.mealId,
        defaultOptionId: m.defaultOptionId,
        option: (label) =>
          exigir(m.optionsPorLabel.get(label), "opção", label, [
            ...m.optionsPorLabel.keys(),
          ]),
      };
    },
  };

  const inserirEventos = async (
    eventos: ReadonlyArray<EventSpec<D>>,
  ): Promise<ReadonlyArray<string>> => {
    if (eventos.length === 0) return [];
    const linhas = eventos.map((e) => {
      const m = mealDe(e.meal);
      // `pulei` e a anulação NUNCA carregam opção cumprida (regra do schema).
      const semOpcao = e.state === "pulei" || e.state === null;
      const optionId = semOpcao
        ? null
        : e.option !== undefined
          ? exigir(m.optionsPorLabel.get(e.option), "opção", e.option, [
              ...m.optionsPorLabel.keys(),
            ])
          : m.defaultOptionId;
      const date = localDate(e.daysAgo);
      return {
        ...(e.id ? { id: e.id } : {}),
        patientId: m.patientId, // DERIVADO
        planId: m.planId, // DERIVADO
        mealId: m.mealId,
        dayTypeId: m.dayTypeId, // DERIVADO — a incoerência do KI-002 é inexpressável
        chosenMealOptionId: optionId,
        state: e.state,
        loggedDate: date,
        createdAt: new Date(`${date}T${e.time ?? DEFAULT_TIME}`),
      };
    });
    const criados = await ex
      .insert(schema.mealEvent)
      .values(linhas)
      .returning({ id: schema.mealEvent.id });
    return criados.map((c) => c.id);
  };

  await inserirEventos(spec.events ?? []);

  const todosOsPacientes = [...mat.patientPorLabel.values()];

  const clearEvents = async (): Promise<void> => {
    if (todosOsPacientes.length === 0) return;
    // Por patientId, não por ids rastreados: pega também o que a casca escreveu
    // via POST /registro durante o teste.
    const eventos = await ex
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent)
      .where(inArray(schema.mealEvent.patientId, todosOsPacientes));
    if (eventos.length === 0) return;
    const eventIds = eventos.map((e) => e.id);
    await ex
      .delete(schema.mealEventItem)
      .where(inArray(schema.mealEventItem.mealEventId, eventIds));
    await ex
      .delete(schema.mealEvent)
      .where(inArray(schema.mealEvent.id, eventIds));
  };

  const destroy = async (): Promise<void> => {
    if (todosOsPacientes.length === 0) return;
    await clearEvents();

    // Ordem reversa de FK. Sempre por POSSE (patientId do cenário), nunca por
    // predicado largo — `destroy()` de um cenário não pode alcançar outro.
    const ciclos = await ex
      .select({ id: schema.cycle.id })
      .from(schema.cycle)
      .where(inArray(schema.cycle.patientId, todosOsPacientes));
    if (ciclos.length > 0) {
      const cycleIds = ciclos.map((c) => c.id);
      await ex
        .delete(schema.cyclePlanVigencia)
        .where(inArray(schema.cyclePlanVigencia.cycleId, cycleIds));
      await ex.delete(schema.cycle).where(inArray(schema.cycle.id, cycleIds));
    }

    const planos = await ex
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(inArray(schema.plan.patientId, todosOsPacientes));
    if (planos.length > 0) {
      const planIds = planos.map((p) => p.id);
      const tipos = await ex
        .select({ id: schema.dayType.id })
        .from(schema.dayType)
        .where(inArray(schema.dayType.planId, planIds));
      if (tipos.length > 0) {
        const dayTypeIds = tipos.map((t) => t.id);
        const refeicoes = await ex
          .select({ id: schema.meal.id })
          .from(schema.meal)
          .where(inArray(schema.meal.dayTypeId, dayTypeIds));
        if (refeicoes.length > 0) {
          const mealIds = refeicoes.map((m) => m.id);
          const opcoes = await ex
            .select({ id: schema.mealOption.id })
            .from(schema.mealOption)
            .where(inArray(schema.mealOption.mealId, mealIds));
          if (opcoes.length > 0) {
            const optionIds = opcoes.map((o) => o.id);
            await ex
              .delete(schema.mealItem)
              .where(inArray(schema.mealItem.mealOptionId, optionIds));
            await ex
              .delete(schema.mealOption)
              .where(inArray(schema.mealOption.id, optionIds));
          }
          await ex.delete(schema.meal).where(inArray(schema.meal.id, mealIds));
        }
        // `day_schedule` referencia plano E tipo — sai antes do tipo.
        await ex
          .delete(schema.daySchedule)
          .where(inArray(schema.daySchedule.planId, planIds));
        await ex
          .delete(schema.dayType)
          .where(inArray(schema.dayType.id, dayTypeIds));
      } else {
        await ex
          .delete(schema.daySchedule)
          .where(inArray(schema.daySchedule.planId, planIds));
      }
      await ex.delete(schema.plan).where(inArray(schema.plan.id, planIds));
    }

    await ex
      .delete(schema.patient)
      .where(inArray(schema.patient.id, todosOsPacientes));
  };

  return { ids, addEvents: inserirEventos, clearEvents, destroy };
}
