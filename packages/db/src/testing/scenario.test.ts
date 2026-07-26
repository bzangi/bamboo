import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../client.js";
import * as schema from "../schema.js";
import { buildScenario, everyWeekday, localDate } from "./scenario.js";
import type { Scenario } from "./scenario.js";

// Unit do construtor de cenário (feature 013). Testa o que é INTERFACE —
// invariantes, lookups, erros e ausência de resíduo — não a implementation.
//
// Fala com o banco (é casca de I/O), então precisa do docker de pé. Não chama
// `pool.end()`: o pool é singleton do package (I-6).

const cenariosVivos: Scenario<string>[] = [];

const criar = async <D extends string>(
  ...args: Parameters<typeof buildScenario<D>>
): Promise<Scenario<D>> => {
  const s = await buildScenario<D>(...args);
  cenariosVivos.push(s as unknown as Scenario<string>);
  return s;
};

afterEach(async () => {
  // Mesmo em falha: nenhum cenário sobrevive a um teste (I-3/I-9). Um paciente
  // órfão pode ser sorteado pelos 12 `from(patient).limit(1)` sem `where` das
  // suítes do apps/api.
  for (const s of cenariosVivos.splice(0)) await s.destroy();
});

// Contagens de TUDO que o construtor pode escrever + as 4 tabelas que ele NUNCA
// pode tocar (I-7).
const TABELAS = {
  patient: schema.patient,
  plan: schema.plan,
  dayType: schema.dayType,
  daySchedule: schema.daySchedule,
  meal: schema.meal,
  mealOption: schema.mealOption,
  mealItem: schema.mealItem,
  cycle: schema.cycle,
  cyclePlanVigencia: schema.cyclePlanVigencia,
  mealEvent: schema.mealEvent,
  mealEventItem: schema.mealEventItem,
  // intocáveis (I-7)
  food: schema.food,
  substitutionGroup: schema.substitutionGroup,
  foodSubstitutionGroup: schema.foodSubstitutionGroup,
  foodHouseholdMeasure: schema.foodHouseholdMeasure,
} as const;

type Contagens = Record<keyof typeof TABELAS, number>;

const contagens = async (): Promise<Contagens> => {
  const out = {} as Record<string, number>;
  for (const [nome, tabela] of Object.entries(TABELAS)) {
    const rows = await db.select({ id: tabela.id }).from(tabela);
    out[nome] = rows.length;
  }
  return out as Contagens;
};

// Cenário mínimo reutilizado: 1 paciente, 1 plano, 1 tipo-de-dia, 2 refeições.
const MINIMO = {
  label: "unit-minimo",
  foods: { base: { minKcalPer100g: 100 } },
  patients: [
    {
      plans: [
        {
          label: "P",
          schedule: everyWeekday("A"),
          dayTypes: [
            {
              label: "A" as const,
              meals: [
                {
                  position: 1,
                  options: [
                    { label: "Padrão", items: [{ food: "base", grams: 100 }] },
                  ],
                },
                {
                  position: 2,
                  options: [
                    { label: "Padrão", items: [{ food: "base", grams: 150 }] },
                    { label: "Pesada", items: [{ food: "base", grams: 300 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const;

describe("localDate", () => {
  it("devolve a data-calendário LOCAL, nunca UTC", () => {
    const d = new Date();
    const esperado = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(localDate()).toBe(esperado);
    expect(localDate(0)).toBe(esperado);
  });

  it("localDate(1) é ontem, por incremento de calendário", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const esperado = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(localDate(1)).toBe(esperado);
  });
});

describe("everyWeekday", () => {
  it("cobre os 7 dias com o mesmo tipo — cenário independente do calendário", () => {
    expect(everyWeekday("A")).toEqual({
      0: "A",
      1: "A",
      2: "A",
      3: "A",
      4: "A",
      5: "A",
      6: "A",
    });
  });
});

describe("buildScenario — o handle resolve ids reais", () => {
  it("materializa e os lookups devolvem ids que existem no banco", async () => {
    const s = await criar(MINIMO);

    const [pat] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.id, s.ids.patient()));
    expect(pat).toBeDefined();

    const [pln] = await db
      .select({ id: schema.plan.id, isActive: schema.plan.isActive })
      .from(schema.plan)
      .where(eq(schema.plan.id, s.ids.plan("P")));
    expect(pln?.isActive).toBe(true); // default `active: true`

    // `meal({dayType, position})` DERIVA plano e paciente do grafo — o chamador
    // não pareia planId/dayTypeId à mão (é a localidade que o desenho compra).
    const m2 = s.ids.meal({ dayType: "A", position: 2 });
    const [mealRow] = await db
      .select({
        dayTypeId: schema.meal.dayTypeId,
        position: schema.meal.position,
      })
      .from(schema.meal)
      .where(eq(schema.meal.id, m2.mealId));
    expect(mealRow?.dayTypeId).toBe(s.ids.dayType("A"));
    expect(mealRow?.position).toBe(2);

    // Opção default = a primeira quando nenhuma é marcada; a nomeada é acessível.
    expect(m2.defaultOptionId).toBe(m2.option("Padrão"));
    expect(m2.option("Pesada")).not.toBe(m2.defaultOptionId);

    // `schedule` cobre os 7 weekdays → o cenário não depende do dia da semana.
    const scheds = await db
      .select({ weekday: schema.daySchedule.weekday })
      .from(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, s.ids.plan("P")));
    expect(scheds.map((x) => x.weekday).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("I-4 — lookup inexistente LANÇA listando os labels existentes, nunca undefined", async () => {
    const s = await criar(MINIMO);

    expect(() => s.ids.plan("NAO-EXISTE")).toThrow(/NAO-EXISTE/);
    expect(() => s.ids.plan("NAO-EXISTE")).toThrow(/\bP\b/); // lista o que existe
    expect(() => s.ids.dayType("Z" as "A")).toThrow(/\bA\b/);
    expect(() => s.ids.meal({ dayType: "A", position: 99 })).toThrow(/99/);
    expect(() => s.ids.patient("fantasma")).toThrow(/fantasma/);
    expect(() => s.ids.food("fantasma")).toThrow(/fantasma/);
    expect(() =>
      s.ids.meal({ dayType: "A", position: 1 }).option("fantasma"),
    ).toThrow(/fantasma/);
  });

  it("I-2 — apelidos distintos resolvem foods DISTINTOS", async () => {
    const s = await criar({
      label: "unit-foods",
      foods: {
        a: { minKcalPer100g: 100 },
        b: { minKcalPer100g: 100 },
      },
      patients: [{}],
    });
    expect(s.ids.food("a")).not.toBe(s.ids.food("b"));
  });

  it("I-2 — food resolvido nunca é degenerado (kcal > 0)", async () => {
    const s = await criar({
      label: "unit-kcal",
      foods: { qualquer: {} },
      patients: [{}],
    });
    const [f] = await db
      .select({ kcal: schema.food.kcalPer100g })
      .from(schema.food)
      .where(eq(schema.food.id, s.ids.food("qualquer")));
    expect(f?.kcal).toBeGreaterThan(0);
  });
});

describe("buildScenario — eventos", () => {
  it("addEvents materializa por (dayType, position) e clearEvents limpa", async () => {
    const s = await criar(MINIMO);

    const ids = await s.addEvents([
      { meal: { dayType: "A", position: 1 }, state: "feito", daysAgo: 0 },
      { meal: { dayType: "A", position: 2 }, state: "pulei", daysAgo: 1 },
    ]);
    expect(ids).toHaveLength(2);

    const evs = await db
      .select({
        mealId: schema.mealEvent.mealId,
        dayTypeId: schema.mealEvent.dayTypeId,
        planId: schema.mealEvent.planId,
        state: schema.mealEvent.state,
        loggedDate: schema.mealEvent.loggedDate,
        chosen: schema.mealEvent.chosenMealOptionId,
      })
      .from(schema.mealEvent)
      .where(eq(schema.mealEvent.patientId, s.ids.patient()));
    expect(evs).toHaveLength(2);

    // dayTypeId e planId DERIVADOS do grafo — a incoerência que o KI-002
    // investiga é inexpressável por construção.
    for (const e of evs) {
      expect(e.dayTypeId).toBe(s.ids.dayType("A"));
      expect(e.planId).toBe(s.ids.plan("P"));
    }
    const feito = evs.find((e) => e.state === "feito");
    const pulei = evs.find((e) => e.state === "pulei");
    expect(feito?.loggedDate).toBe(localDate(0));
    expect(pulei?.loggedDate).toBe(localDate(1));
    // `feito` sem `option` usa a padrão; `pulei` é forçado a null (regra do schema).
    expect(feito?.chosen).toBe(
      s.ids.meal({ dayType: "A", position: 1 }).defaultOptionId,
    );
    expect(pulei?.chosen).toBeNull();

    await s.clearEvents();
    const depois = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent)
      .where(eq(schema.mealEvent.patientId, s.ids.patient()));
    expect(depois).toHaveLength(0);
  });

  it("`id` explícito é respeitado (desempate determinístico de created_at)", async () => {
    const s = await criar(MINIMO);
    const UUID = "aaaaaaaa-0000-4000-8000-0000000000ff";
    const [id] = await s.addEvents([
      {
        meal: { dayType: "A", position: 1 },
        state: "feito",
        daysAgo: 0,
        time: "08:00:00",
        id: UUID,
      },
    ]);
    expect(id).toBe(UUID);
  });

  it("anulação (state null) grava tombstone com chosenMealOptionId null", async () => {
    const s = await criar(MINIMO);
    await s.addEvents([
      {
        meal: { dayType: "A", position: 1 },
        state: "feito",
        daysAgo: 0,
        time: "08:00:00",
      },
      {
        meal: { dayType: "A", position: 1 },
        state: null,
        daysAgo: 0,
        time: "09:00:00",
      },
    ]);
    const evs = await db
      .select({
        state: schema.mealEvent.state,
        chosen: schema.mealEvent.chosenMealOptionId,
      })
      .from(schema.mealEvent)
      .where(eq(schema.mealEvent.patientId, s.ids.patient()));
    const tomb = evs.find((e) => e.state === null);
    expect(tomb).toBeDefined();
    expect(tomb?.chosen).toBeNull();
  });
});

describe("buildScenario — I-5: valida antes de inserir, com mensagem", () => {
  const semResiduo = async (fn: () => Promise<unknown>) => {
    const antes = await contagens();
    await expect(fn()).rejects.toThrow();
    // I-1: spec inválida não deixa NADA escrito.
    expect(await contagens()).toEqual(antes);
  };

  it("dois ciclos abertos no mesmo paciente → erro com mensagem, não erro cru do Postgres", async () => {
    await semResiduo(() =>
      buildScenario({
        label: "unit-2ciclos",
        patients: [
          {
            cycles: [
              { label: "c1", startedDaysAgo: 10, expectedDurationDays: 30 },
              { label: "c2", startedDaysAgo: 5, expectedDurationDays: 30 },
            ],
          },
        ],
      }),
    );
    await expect(
      buildScenario({
        label: "unit-2ciclos-msg",
        patients: [
          {
            cycles: [
              { label: "c1", startedDaysAgo: 10, expectedDurationDays: 30 },
              { label: "c2", startedDaysAgo: 5, expectedDurationDays: 30 },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/ciclo/i);
  });

  it("label de tipo-de-dia duplicado → erro", async () => {
    await semResiduo(() =>
      buildScenario({
        label: "unit-dup-dt",
        foods: { base: { minKcalPer100g: 100 } },
        patients: [
          {
            plans: [
              {
                label: "P",
                dayTypes: [
                  {
                    label: "A",
                    meals: [
                      {
                        position: 1,
                        options: [
                          { label: "o", items: [{ food: "base", grams: 10 }] },
                        ],
                      },
                    ],
                  },
                  {
                    label: "A",
                    meals: [
                      {
                        position: 1,
                        options: [
                          { label: "o", items: [{ food: "base", grams: 10 }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });

  it("position duplicada DENTRO de um tipo-de-dia → erro", async () => {
    await semResiduo(() =>
      buildScenario({
        label: "unit-dup-pos",
        foods: { base: { minKcalPer100g: 100 } },
        patients: [
          {
            plans: [
              {
                label: "P",
                dayTypes: [
                  {
                    label: "A",
                    meals: [
                      {
                        position: 1,
                        options: [
                          { label: "o", items: [{ food: "base", grams: 10 }] },
                        ],
                      },
                      {
                        position: 1,
                        options: [
                          { label: "o", items: [{ food: "base", grams: 10 }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });

  it("I-1 — apelido de food irresolvível LANÇA sem ter escrito nada", async () => {
    await semResiduo(() =>
      buildScenario({
        label: "unit-food-impossivel",
        foods: { impossivel: { name: "Alimento Que Nao Existe (013)" } },
        patients: [{}],
      }),
    );
  });

  it("item referenciando apelido não declarado → erro", async () => {
    await semResiduo(() =>
      buildScenario({
        label: "unit-alias-solto",
        patients: [
          {
            plans: [
              {
                label: "P",
                dayTypes: [
                  {
                    label: "A",
                    meals: [
                      {
                        position: 1,
                        options: [
                          {
                            label: "o",
                            items: [{ food: "nao-declarado", grams: 10 }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });
});

describe("buildScenario — SC-005: destroy não deixa resíduo", () => {
  it("cenário completo: contagens de TODAS as tabelas voltam ao valor de antes", async () => {
    const antes = await contagens();

    const s = await buildScenario({
      label: "unit-residuo",
      foods: { a: { minKcalPer100g: 100 }, b: { minKcalPer100g: 100 } },
      patients: [
        {
          label: "principal",
          exposure: "full_kcal",
          bandTolerancePct: 10,
          floorPct: 50,
          plans: [
            {
              label: "P1",
              active: false,
              dayTypes: [
                {
                  label: "R",
                  meals: [
                    {
                      position: 1,
                      options: [
                        { label: "o", items: [{ food: "a", grams: 100 }] },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              label: "P2",
              schedule: everyWeekday("A"),
              dayTypes: [
                {
                  label: "A",
                  meals: [
                    {
                      position: 1,
                      options: [
                        {
                          label: "o",
                          items: [
                            {
                              food: "b",
                              grams: 100,
                              group: "Amidos e cereais",
                              locked: false,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  label: "B",
                  meals: [
                    {
                      position: 1,
                      options: [
                        { label: "o", items: [{ food: "b", grams: 120 }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          cycles: [
            {
              label: "aberto",
              startedDaysAgo: 3,
              expectedDurationDays: 30,
              planWindows: [{ plan: "P2", fromDaysAgo: 3 }],
            },
          ],
        },
        { label: "outro" },
      ],
      events: [
        { meal: { dayType: "A", position: 1 }, state: "feito", daysAgo: 0 },
        { meal: { dayType: "B", position: 1 }, state: "pulei", daysAgo: 0 },
        { meal: { dayType: "R", position: 1 }, state: "feito", daysAgo: 2 },
      ],
    });

    // Sanidade: escreveu de verdade (senão o teste de resíduo é vacuidade).
    const durante = await contagens();
    expect(durante.patient).toBe(antes.patient + 2);
    expect(durante.plan).toBe(antes.plan + 2);
    expect(durante.dayType).toBe(antes.dayType + 3);
    expect(durante.mealEvent).toBe(antes.mealEvent + 3);
    expect(durante.cycle).toBe(antes.cycle + 1);

    // I-7: as 4 tabelas de pré-requisito NUNCA são escritas.
    expect(durante.food).toBe(antes.food);
    expect(durante.substitutionGroup).toBe(antes.substitutionGroup);
    expect(durante.foodSubstitutionGroup).toBe(antes.foodSubstitutionGroup);
    expect(durante.foodHouseholdMeasure).toBe(antes.foodHouseholdMeasure);

    await s.destroy();
    expect(await contagens()).toEqual(antes);

    await s.destroy(); // idempotente
    expect(await contagens()).toEqual(antes);
  });

  it("destroy alcança também os meal_event escritos DEPOIS (via addEvents)", async () => {
    const antes = await contagens();
    const s = await buildScenario(MINIMO);
    await s.addEvents([
      { meal: { dayType: "A", position: 1 }, state: "feito", daysAgo: 0 },
    ]);
    await s.destroy();
    expect(await contagens()).toEqual(antes);
  });

  it("destroy NÃO alcança dado de outro cenário (FR-004)", async () => {
    const a = await criar({ ...MINIMO, label: "unit-iso-a" });
    const b = await buildScenario({ ...MINIMO, label: "unit-iso-b" });
    await b.destroy();

    // O cenário A sobrevive intacto ao destroy de B.
    const [ainda] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.id, a.ids.patient()));
    expect(ainda).toBeDefined();
  });
});

describe("buildScenario — o 2º adapter do seam (FR-010)", () => {
  it("dentro de uma transação do CHAMADOR com rollback, nada persiste", async () => {
    const antes = await contagens();

    await expect(
      db.transaction(async (tx) => {
        const s = await buildScenario(
          { ...MINIMO, label: "unit-tx" },
          { executor: tx },
        );
        // Dentro da tx o cenário existe...
        const [visto] = await tx
          .select({ id: schema.patient.id })
          .from(schema.patient)
          .where(eq(schema.patient.id, s.ids.patient()));
        expect(visto).toBeDefined();
        throw new Error("rollback proposital");
      }),
    ).rejects.toThrow("rollback proposital");

    // ...e desaparece no rollback. É a prova de que o seed.ts, que já roda tudo
    // numa transação própria, PODE ser chamador — sem tocar o seed.ts.
    expect(await contagens()).toEqual(antes);
  });
});

// Guarda contra vazamento entre execuções: nenhum paciente de cenário unit fica.
describe("higiene", () => {
  it("não sobrou paciente de cenário unit no banco", async () => {
    const restos = await db
      .select({ id: schema.patient.id, name: schema.patient.name })
      .from(schema.patient);
    expect(restos.filter((p) => p.name.includes("unit-"))).toEqual([]);
    expect(pool).toBeDefined(); // pool segue aberto (I-6): nunca `pool.end()`
  });
});
