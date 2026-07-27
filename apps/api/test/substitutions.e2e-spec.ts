import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNotNull, db, pool, schema } from '@bamboo/db';
import type { ExposureLevel } from '@bamboo/types';
import { SubstitutionModule } from '../src/substitution/substitution.module';

// e2e US2 — GET /meal-items/:id/substitutions. Importa SÓ o SubstitutionModule.
// IDs por query (o seed gera UUIDs novos a cada run).
describe('GET /meal-items/:id/substitutions (US2)', () => {
  let app: INestApplication;
  let flexItemId: string;
  let flexGroupId: string;
  let flexFoodId: string;
  let lockedItemId: string;

  beforeAll(async () => {
    // Item flexível: não travado, com grupo.
    const [flex] = await db
      .select({
        id: schema.mealItem.id,
        foodId: schema.mealItem.foodId,
        groupId: schema.mealItem.substitutionGroupId,
      })
      .from(schema.mealItem)
      .where(
        and(
          eq(schema.mealItem.isLocked, false),
          isNotNull(schema.mealItem.substitutionGroupId),
        ),
      )
      .limit(1);
    flexItemId = flex.id;
    flexFoodId = flex.foodId;
    flexGroupId = flex.groupId!;

    // Item travado.
    const [locked] = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.isLocked, true))
      .limit(1);
    lockedItemId = locked.id;

    const moduleRef = await Test.createTestingModule({
      imports: [SubstitutionModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('retorna alternativas do MESMO grupo com gramas + medidaCaseira', async () => {
    const res = await request(app.getHttpServer())
      .get(`/meal-items/${flexItemId}/substitutions`)
      .expect(200);

    const body = res.body;
    expect(body.itemId).toBe(flexItemId);
    expect(body.group.id).toBe(flexGroupId);
    expect(['carb', 'protein', 'fat', 'kcal']).toContain(body.group.basis);
    expect(body.current.foodId).toBe(flexFoodId);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(body.alternatives.length).toBeGreaterThan(0);

    // todas do mesmo grupo (DB-side): conferimos via food_substitution_group.
    const groupFoodRows = await db
      .select({ foodId: schema.foodSubstitutionGroup.foodId })
      .from(schema.foodSubstitutionGroup)
      .where(eq(schema.foodSubstitutionGroup.groupId, flexGroupId));
    const groupFoodIds = new Set(groupFoodRows.map((r) => r.foodId));

    for (const alt of body.alternatives as Array<{
      foodId: string;
      gramas: number;
      medidaCaseira: { label: string; grams: number } | null;
    }>) {
      expect(groupFoodIds.has(alt.foodId)).toBe(true);
      expect(alt.foodId).not.toBe(flexFoodId); // exclui o atual
      expect(typeof alt.gramas).toBe('number');
      expect(alt.gramas).toBeGreaterThan(0);
      // medidaCaseira é objeto {label,grams} ou null.
      if (alt.medidaCaseira !== null) {
        expect(typeof alt.medidaCaseira.label).toBe('string');
        expect(typeof alt.medidaCaseira.grams).toBe('number');
      }
    }
  });

  it('preserva o nutriente-base do grupo dentro de ≤ 2% (SC-003)', async () => {
    // Carrega macros do food atual + quantidade do item.
    const [cur] = await db
      .select({
        quantityGrams: schema.mealItem.quantityGrams,
        carb: schema.food.carbPer100g,
        protein: schema.food.proteinPer100g,
        fat: schema.food.fatPer100g,
        kcal: schema.food.kcalPer100g,
      })
      .from(schema.mealItem)
      .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
      .where(eq(schema.mealItem.id, flexItemId))
      .limit(1);
    const [grp] = await db
      .select({ basis: schema.substitutionGroup.basis })
      .from(schema.substitutionGroup)
      .where(eq(schema.substitutionGroup.id, flexGroupId))
      .limit(1);

    const per100 = (f: {
      carb: number;
      protein: number;
      fat: number;
      kcal: number;
    }): number =>
      grp.basis === 'carb'
        ? f.carb
        : grp.basis === 'protein'
          ? f.protein
          : grp.basis === 'fat'
            ? f.fat
            : f.kcal;
    const nutBaseOrigem = (per100(cur) / 100) * cur.quantityGrams;

    const res = await request(app.getHttpServer())
      .get(`/meal-items/${flexItemId}/substitutions`)
      .expect(200);

    for (const alt of res.body.alternatives as Array<{
      foodId: string;
      gramas: number;
    }>) {
      const [af] = await db
        .select({
          carb: schema.food.carbPer100g,
          protein: schema.food.proteinPer100g,
          fat: schema.food.fatPer100g,
          kcal: schema.food.kcalPer100g,
        })
        .from(schema.food)
        .where(eq(schema.food.id, alt.foodId))
        .limit(1);
      const nutBaseAlvo = (per100(af) / 100) * alt.gramas;
      // gramas no DTO é arredondado a 1 casa; afere a preservação com folga.
      const erro = Math.abs(nutBaseAlvo - nutBaseOrigem) / nutBaseOrigem;
      expect(erro).toBeLessThanOrEqual(0.02);
    }
  });

  it('Feature 008 — alimento AUTO-classificado no grupo aparece como substituto', async () => {
    // Simula a saída da classificação automática: insere um food novo + vínculo
    // origin='auto' no grupo do item flexível. Deve virar opção de troca, com a
    // mesma mecânica (gramas recalculadas). Self-contained: cria e limpa.
    const [novo] = await db
      .insert(schema.food)
      .values({
        name: 'Alimento auto (e2e 008)',
        source: 'taco',
        kcalPer100g: 130,
        carbPer100g: 28,
        proteinPer100g: 2.5,
        fatPer100g: 0.3,
      })
      .returning({ id: schema.food.id });
    const [vinc] = await db
      .insert(schema.foodSubstitutionGroup)
      .values({
        foodId: novo.id,
        groupId: flexGroupId,
        referencePortionGrams: 105,
        origin: 'auto',
      })
      .returning({ id: schema.foodSubstitutionGroup.id });

    try {
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      const alt = (
        res.body.alternatives as Array<{ foodId: string; gramas: number }>
      ).find((a) => a.foodId === novo.id);
      expect(
        alt,
        'o alimento auto-classificado deve ser uma alternativa',
      ).toBeDefined();
      expect(alt!.gramas).toBeGreaterThan(0);
    } finally {
      await db
        .delete(schema.foodSubstitutionGroup)
        .where(eq(schema.foodSubstitutionGroup.id, vinc.id));
      await db.delete(schema.food).where(eq(schema.food.id, novo.id));
    }
  });

  it('grupo sem outras alternativas -> 200 + alternatives: [] (US2b/FR-006)', async () => {
    // Self-contained: item novo num grupo UNITÁRIO (só ele), na mesma
    // meal_option do item flexível semeado (chain até patient já resolvida).
    // Cria e limpa; sem efeito colateral em outras suítes.
    const [flexRow] = await db
      .select({ mealOptionId: schema.mealItem.mealOptionId })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.id, flexItemId))
      .limit(1);

    const [novoFood] = await db
      .insert(schema.food)
      .values({
        name: 'Alimento unitário (e2e 010)',
        source: 'taco',
        kcalPer100g: 100,
        carbPer100g: 20,
        proteinPer100g: 5,
        fatPer100g: 2,
      })
      .returning({ id: schema.food.id });
    const [novoGrupo] = await db
      .insert(schema.substitutionGroup)
      .values({ name: 'Grupo unitário (e2e 010)', basis: 'carb' })
      .returning({ id: schema.substitutionGroup.id });
    const [vinculo] = await db
      .insert(schema.foodSubstitutionGroup)
      .values({
        foodId: novoFood.id,
        groupId: novoGrupo.id,
        referencePortionGrams: 100,
        origin: 'manual',
      })
      .returning({ id: schema.foodSubstitutionGroup.id });
    const [novoItem] = await db
      .insert(schema.mealItem)
      .values({
        mealOptionId: flexRow.mealOptionId,
        foodId: novoFood.id,
        quantityGrams: 100,
        isLocked: false,
        substitutionGroupId: novoGrupo.id,
      })
      .returning({ id: schema.mealItem.id });

    try {
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${novoItem.id}/substitutions`)
        .expect(200);
      expect(res.body.alternatives).toEqual([]);
    } finally {
      await db
        .delete(schema.mealItem)
        .where(eq(schema.mealItem.id, novoItem.id));
      await db
        .delete(schema.foodSubstitutionGroup)
        .where(eq(schema.foodSubstitutionGroup.id, vinculo.id));
      await db
        .delete(schema.substitutionGroup)
        .where(eq(schema.substitutionGroup.id, novoGrupo.id));
      await db.delete(schema.food).where(eq(schema.food.id, novoFood.id));
    }
  });

  it('item travado -> 422 (não substituível)', async () => {
    await request(app.getHttpServer())
      .get(`/meal-items/${lockedItemId}/substitutions`)
      .expect(422);
  });

  it('404 para item inexistente (uuid válido)', async () => {
    await request(app.getHttpServer())
      .get('/meal-items/00000000-0000-0000-0000-000000000000/substitutions')
      .expect(404);
  });

  it('400 para id não-uuid (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .get('/meal-items/not-a-uuid/substitutions')
      .expect(400);
  });

  // 019 — busca e página. Aninhado no describe pai pelo mesmo motivo do bloco da
  // 010 abaixo: o afterAll dele fecha o pool.
  describe('019 busca e página (q/limit/offset)', () => {
    type Alt = { readonly foodId: string; readonly name: string };

    const pedir = async (qs = ''): Promise<Alt[]> => {
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions${qs}`)
        .expect(200);
      return res.body.alternatives as Alt[];
    };

    it('sem parâmetro nenhum, a resposta é a de sempre (grupo inteiro)', async () => {
      const todas = await pedir();
      // Pré-condição do bloco: o grupo do seed precisa ter com o que paginar.
      expect(
        todas.length,
        'o grupo do item semeado precisa de ≥3 alternativas para este bloco',
      ).toBeGreaterThanOrEqual(3);
    });

    it('as páginas se emendam e cobrem a lista inteira, sem repetir nem pular', async () => {
      const todas = await pedir();
      const p1 = await pedir('?limit=2&offset=0');
      const p2 = await pedir('?limit=2&offset=2');

      expect(p1.length).toBe(2);
      expect([...p1, ...p2].map((a) => a.foodId)).toEqual(
        todas.slice(0, p1.length + p2.length).map((a) => a.foodId),
      );
    });

    it('offset além do fim devolve lista vazia — é como o app sabe que acabou', async () => {
      const todas = await pedir();
      expect(await pedir(`?limit=5&offset=${todas.length}`)).toEqual([]);
    });

    it('q filtra por nome, e a página vale sobre o resultado da busca', async () => {
      const todas = await pedir();
      // Um trecho do nome de uma alternativa que existe: a busca tem de achá-la.
      const alvo = todas[0];
      const termo = alvo.name.slice(0, 4);

      const casaram = await pedir(`?q=${encodeURIComponent(termo)}`);
      expect(casaram.map((a) => a.foodId)).toContain(alvo.foodId);
      expect(casaram.length).toBeLessThanOrEqual(todas.length);

      const primeira = await pedir(`?q=${encodeURIComponent(termo)}&limit=1`);
      expect(primeira.length).toBe(1);
      expect(primeira[0].foodId).toBe(casaram[0].foodId);
    });

    it('q que não casa com nada devolve lista vazia, e não erro', async () => {
      expect(await pedir('?q=zzzznaoexistezzzz')).toEqual([]);
    });

    it('limit/offset fora de forma não derrubam a lista', async () => {
      const todas = await pedir();
      expect((await pedir('?offset=abc')).map((a) => a.foodId)).toEqual(
        todas.map((a) => a.foodId),
      );
      expect((await pedir('?limit=0')).length).toBeGreaterThan(0);
    });
  });

  // 021 — o food de origem vira candidato do combinar (aditivo; troca simples
  // continua excluindo-o, comportamento intacto — testado acima).
  describe('021 includeSelf — alimento de origem também combinável', () => {
    it('sem includeSelf, resposta idêntica à de hoje (food de origem fora)', async () => {
      const semParam = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      const comFalse = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions?includeSelf=false`)
        .expect(200);
      expect(comFalse.body.alternatives).toEqual(semParam.body.alternatives);
      expect(
        (semParam.body.alternatives as Array<{ foodId: string }>).map(
          (a) => a.foodId,
        ),
      ).not.toContain(flexFoodId);
    });

    it('com includeSelf=true, o food de origem entra com as gramas atuais', async () => {
      const [item] = await db
        .select({ quantityGrams: schema.mealItem.quantityGrams })
        .from(schema.mealItem)
        .where(eq(schema.mealItem.id, flexItemId))
        .limit(1);

      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions?includeSelf=true`)
        .expect(200);

      const self = (
        res.body.alternatives as Array<{ foodId: string; gramas: number }>
      ).find((a) => a.foodId === flexFoodId);
      expect(self).toBeDefined();
      expect(self!.gramas).toBeCloseTo(item.quantityGrams, 5);
    });

    it('includeSelf=true continua paginando/buscando normalmente (019)', async () => {
      const cheio = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions?includeSelf=true`)
        .expect(200);
      const todas = cheio.body.alternatives as Array<{ foodId: string }>;
      expect(todas.length).toBeGreaterThan(1); // origem + ao menos 1 outro

      const pagina = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions?includeSelf=true&limit=1`)
        .expect(200);
      expect(pagina.body.alternatives.length).toBe(1);
    });
  });

  // US1-010: nutrição da porção equivalente, sob o mesmo gate de exposição do
  // /today. ANINHADO no describe pai (não top-level): o afterAll dele chama
  // pool.end(), então um segundo describe top-level neste arquivo quebraria o
  // beforeAll seguinte (lição a2894f3/KI-001).
  describe('US1-010 nutrição da alternativa sob gate', () => {
    let patientId: string;
    let originalExposure: ExposureLevel;

    async function setExposure(level: ExposureLevel): Promise<void> {
      await db
        .update(schema.patient)
        .set({ exposure: level })
        .where(eq(schema.patient.id, patientId));
    }

    beforeAll(async () => {
      // Dono do item: meal_item -> meal_option -> meal -> day_type -> plan -> patient.
      const [row] = await db
        .select({
          patientId: schema.patient.id,
          exposure: schema.patient.exposure,
        })
        .from(schema.mealItem)
        .innerJoin(
          schema.mealOption,
          eq(schema.mealItem.mealOptionId, schema.mealOption.id),
        )
        .innerJoin(schema.meal, eq(schema.mealOption.mealId, schema.meal.id))
        .innerJoin(schema.dayType, eq(schema.meal.dayTypeId, schema.dayType.id))
        .innerJoin(schema.plan, eq(schema.dayType.planId, schema.plan.id))
        .innerJoin(schema.patient, eq(schema.plan.patientId, schema.patient.id))
        .where(eq(schema.mealItem.id, flexItemId))
        .limit(1);
      patientId = row.patientId;
      originalExposure = row.exposure;
    });

    // Restaura o exposure original — não vaza estado mutado entre suítes.
    afterAll(async () => {
      await setExposure(originalExposure);
    });

    it('full_kcal -> nutrition completo e coerente com as gramas exibidas', async () => {
      await setExposure('full_kcal');
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      expect(res.body.alternatives.length).toBeGreaterThan(0);

      for (const alt of res.body.alternatives as Array<{
        foodId: string;
        gramas: number;
        nutrition?: Record<string, number>;
      }>) {
        const n = alt.nutrition;
        expect(n).toBeDefined();
        const [food] = await db
          .select({
            kcal: schema.food.kcalPer100g,
            carb: schema.food.carbPer100g,
            protein: schema.food.proteinPer100g,
            fat: schema.food.fatPer100g,
          })
          .from(schema.food)
          .where(eq(schema.food.id, alt.foodId))
          .limit(1);
        const fator = alt.gramas / 100;
        expect(n!.kcal).toBeCloseTo(Math.round(food.kcal * fator), 0);
        expect(n!.carb).toBeCloseTo(food.carb * fator, 1);
        expect(n!.protein).toBeCloseTo(food.protein * fator, 1);
        expect(n!.fat).toBeCloseTo(food.fat * fator, 1);
        expect(Number.isInteger(n!.carbPct)).toBe(true);
        expect(Number.isInteger(n!.proteinPct)).toBe(true);
        expect(Number.isInteger(n!.fatPct)).toBe(true);
      }
    });

    it('macros -> macros sem kcal', async () => {
      await setExposure('macros');
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      for (const alt of res.body.alternatives as Array<{
        nutrition?: Record<string, unknown>;
      }>) {
        expect(alt.nutrition).toBeDefined();
        expect(alt.nutrition!.kcal).toBeUndefined();
        expect(typeof alt.nutrition!.carb).toBe('number');
        expect(typeof alt.nutrition!.protein).toBe('number');
        expect(typeof alt.nutrition!.fat).toBe('number');
        expect(typeof alt.nutrition!.carbPct).toBe('number');
      }
    });

    it('percent -> só as proporções (*Pct)', async () => {
      await setExposure('percent');
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      for (const alt of res.body.alternatives as Array<{
        nutrition?: Record<string, unknown>;
      }>) {
        expect(alt.nutrition).toBeDefined();
        expect(alt.nutrition!.kcal).toBeUndefined();
        expect(alt.nutrition!.carb).toBeUndefined();
        expect(alt.nutrition!.protein).toBeUndefined();
        expect(alt.nutrition!.fat).toBeUndefined();
        expect(typeof alt.nutrition!.carbPct).toBe('number');
        expect(typeof alt.nutrition!.proteinPct).toBe('number');
        expect(typeof alt.nutrition!.fatPct).toBe('number');
      }
    });

    it('hidden -> campo nutrition ausente (guarda de regressão hoje)', async () => {
      await setExposure('hidden');
      const res = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      for (const alt of res.body.alternatives as Array<{
        nutrition?: unknown;
      }>) {
        expect(alt.nutrition).toBeUndefined();
      }
    });

    it('FR-004: nome/gramas/medidaCaseira/ordem inalterados em qualquer exposure', async () => {
      await setExposure('full_kcal');
      const withNutrition = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);
      await setExposure('hidden');
      const withoutNutrition = await request(app.getHttpServer())
        .get(`/meal-items/${flexItemId}/substitutions`)
        .expect(200);

      const strip = (
        alts: Array<{ nutrition?: unknown; [k: string]: unknown }>,
      ) =>
        alts.map((alt) => {
          const rest = { ...alt };
          delete rest.nutrition;
          return rest;
        });
      expect(strip(withoutNutrition.body.alternatives)).toEqual(
        strip(withNutrition.body.alternatives),
      );
    });
  });
});
