import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, ne, db, pool, schema } from '@bamboo/db';
import { RegistroModule } from '../src/registro/registro.module';
import { PlanModule } from '../src/plan/plan.module';

// e2e US1 (test-first) — POST /patients/:id/registro + reflexo no GET /today.
// Registrar feito/pulei numa refeição do dia, "o agora" avança, estado vigente
// persiste entre GETs e o dia conclui quando todas registradas. IDs por query
// (o seed gera UUIDs novos a cada run; resolve o day_type de hoje).
//
// Casos de troquei/correção/desfazer são US2/US3 — fora desta suíte.
//
// NB: cada `it` depende do estado deixado pelo anterior (registros são
// append-only no banco). A suíte roda sequencial (fileParallelism:false) e os
// passos são encadeados de propósito (passo 1 registra a 1ª, passo 2 lê, etc.).
describe('POST /patients/:id/registro (US1) + reflexo no GET /today', () => {
  let app: INestApplication;
  let patientId: string;
  let mealIds: string[]; // refeições do dia, na ordem do plano (position asc)

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;

    const [pln] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);

    // day_type de hoje (mesma resolução do service: weekday do servidor).
    const weekday = new Date().getDay();
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, pln.id),
          eq(schema.daySchedule.weekday, weekday),
        ),
      )
      .limit(1);

    const meals = await db
      .select({ id: schema.meal.id, position: schema.meal.position })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));
    mealIds = meals.map((m) => m.id);

    const moduleRef = await Test.createTestingModule({
      // RegistroModule p/ o POST; PlanModule p/ o GET /today (reflexo do estado).
      imports: [RegistroModule, PlanModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Só fecha a app desta suíte; o `pool` (módulo @bamboo/db) é COMPARTILHADO
    // com a suíte US2 abaixo (mesmo arquivo/processo). Fechar aqui derrubaria as
    // queries do beforeAll da US2 → o pool.end() único fica no afterAll da US2.
    await app?.close();
  });

  it('estado inicial: GET /today → currentMealId = 1ª, toda refeição registro=null, diaConcluido=false', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.diaConcluido).toBe(false);
    expect(res.body.currentMealId).toBe(mealIds[0]);
    for (const m of res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>) {
      expect(m.registro).toBeNull();
    }
    const current = (
      res.body.meals as Array<{ id: string; isCurrent: boolean }>
    ).find((m) => m.isCurrent);
    expect(current?.id).toBe(mealIds[0]);
  });

  it('POST feito SEM consumo (assume default) na 1ª refeição → 200, vigente.state="feito", currentMealId avança p/ a 2ª', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: mealIds[0], intent: 'feito' })
      .expect(200);

    expect(res.body.mealId).toBe(mealIds[0]);
    expect(typeof res.body.loggedDate).toBe('string');
    expect(res.body.vigente).toEqual({ state: 'feito' });
    expect(res.body.currentMealId).toBe(mealIds[1]);
    expect(res.body.diaConcluido).toBe(false);
  });

  it('GET /today reflete registro.state="feito" na 1ª e isCurrent na 2ª', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.currentMealId).toBe(mealIds[1]);
    expect(res.body.diaConcluido).toBe(false);

    const meals = res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>;
    const first = meals.find((m) => m.id === mealIds[0]);
    const second = meals.find((m) => m.id === mealIds[1]);
    expect(first?.registro).toEqual({ state: 'feito' });
    expect(first?.isCurrent).toBe(false);
    expect(second?.registro).toBeNull();
    expect(second?.isCurrent).toBe(true);
  });

  it('POST pulei na 2ª refeição → 200, vigente.state="pulei", "o agora" avança p/ a 3ª', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: mealIds[1], intent: 'pulei' })
      .expect(200);

    expect(res.body.vigente).toEqual({ state: 'pulei' });
    expect(res.body.currentMealId).toBe(mealIds[2]);
    expect(res.body.diaConcluido).toBe(false);
  });

  it('persistência: novo GET /today mantém os estados (1ª feito, 2ª pulei, 3ª é o agora)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.currentMealId).toBe(mealIds[2]);
    const meals = res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>;
    expect(meals.find((m) => m.id === mealIds[0])?.registro).toEqual({
      state: 'feito',
    });
    expect(meals.find((m) => m.id === mealIds[1])?.registro).toEqual({
      state: 'pulei',
    });
    expect(meals.find((m) => m.id === mealIds[2])?.isCurrent).toBe(true);
  });

  it('registrar TODAS as refeições restantes → última retorna currentMealId=null + diaConcluido=true', async () => {
    // 1ª e 2ª já registradas; fecha da 3ª em diante.
    for (let i = 2; i < mealIds.length; i++) {
      const res = await request(app.getHttpServer())
        .post(`/patients/${patientId}/registro`)
        .send({ mealId: mealIds[i], intent: 'feito' })
        .expect(200);

      if (i < mealIds.length - 1) {
        expect(res.body.currentMealId).toBe(mealIds[i + 1]);
        expect(res.body.diaConcluido).toBe(false);
      } else {
        // última: dia concluído.
        expect(res.body.currentMealId).toBeNull();
        expect(res.body.diaConcluido).toBe(true);
      }
    }

    // GET /today confirma o dia concluído.
    const today = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    expect(today.body.currentMealId).toBeNull();
    expect(today.body.diaConcluido).toBe(true);
    for (const m of today.body.meals as Array<{
      registro: { state: string } | null;
      isCurrent: boolean;
    }>) {
      expect(m.registro).not.toBeNull();
      expect(m.isCurrent).toBe(false);
    }
  });

  it('paciente inexistente (uuid válido, sem plano) → 404', async () => {
    await request(app.getHttpServer())
      .post('/patients/00000000-0000-0000-0000-000000000000/registro')
      .send({ mealId: mealIds[0], intent: 'feito' })
      .expect(404);
  });

  it('patientId não-uuid → 400 (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .post('/patients/not-a-uuid/registro')
      .send({ mealId: mealIds[0], intent: 'feito' })
      .expect(400);
  });

  it('corpo inválido (mealId não-uuid) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: 'nope', intent: 'feito' })
      .expect(400);
  });

  it('corpo inválido (intent fora do enum) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: mealIds[0], intent: 'troquei' })
      .expect(400);
  });
});

// e2e US2 (test-first) — derivação de "troquei" (FR-003): o cliente NUNCA envia
// "troquei"; o servidor o deriva de consumo.items (substituição within-group,
// grupos RESOLVIDOS NO BANCO) ou de consumo.chosenOptionId (opção não-default).
// Cobertura (contracts/http-registro.md "Cobertura e2e" US2):
//   - feito + items=[{itemId, foodId=substituto-do-mesmo-grupo, gramas}] → troquei
//   - feito + chosenOptionId=opção NÃO-default → troquei
//   - feito + items com foodId de OUTRO grupo → 422 (consumo-fora-do-grupo)
//   - feito + substituicao com items=[] → 422 (consumo-invalido) OU n/a pelo shape
//
// Isolamento: a suíte US1 (acima) roda PRIMEIRO no mesmo arquivo (sequencial,
// fileParallelism:false) e suas asserções já fecharam quando esta começa. Ainda
// assim, cada caso US2 DESFAZ (intent="desfazer") o que registrou ao final, pra
// manter o escopo (paciente, refeição, dia) append-only-limpo e não influenciar
// casos vizinhos. Alvo = o "Almoço" de hoje (o seed dá ≥2 opções + item flexível
// com grupo), distinto das asserções por-posição da US1.
describe('POST /patients/:id/registro (US2) — derivação de "troquei"', () => {
  let app: INestApplication;
  let patientId: string;
  let almocoMealId: string;
  let defaultOptionId: string;
  let nonDefaultOptionId: string;
  let flexItemId: string; // item flexível (com grupo) da opção default
  let sameGroupFoodId: string; // food do MESMO grupo do flexItem (substituto real)
  let otherGroupFoodId: string; // food de OUTRO grupo (caso 422)

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;

    const [pln] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);

    // day_type de hoje (mesma resolução do service: weekday do servidor).
    const weekday = new Date().getDay();
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, pln.id),
          eq(schema.daySchedule.weekday, weekday),
        ),
      )
      .limit(1);
    const dayTypeId = sched.dayTypeId;

    // Refeição "Almoço" de hoje (o seed garante ≥2 opções nela, em treino e
    // descanso). Cai aqui independentemente do tipo-de-dia que hoje resolver.
    const [almoco] = await db
      .select({ id: schema.meal.id })
      .from(schema.meal)
      .where(
        and(
          eq(schema.meal.dayTypeId, dayTypeId),
          eq(schema.meal.name, 'Almoço'),
        ),
      )
      .limit(1);
    almocoMealId = almoco.id;

    // Opção default e uma NÃO-default da refeição.
    const [defOpt] = await db
      .select({ id: schema.mealOption.id })
      .from(schema.mealOption)
      .where(
        and(
          eq(schema.mealOption.mealId, almocoMealId),
          eq(schema.mealOption.isDefault, true),
        ),
      )
      .limit(1);
    defaultOptionId = defOpt.id;

    const [ndOpt] = await db
      .select({ id: schema.mealOption.id })
      .from(schema.mealOption)
      .where(
        and(
          eq(schema.mealOption.mealId, almocoMealId),
          eq(schema.mealOption.isDefault, false),
        ),
      )
      .limit(1);
    nonDefaultOptionId = ndOpt.id;

    // Item FLEXÍVEL (com grupo) da opção default → o que será substituído.
    const flexItems = await db
      .select({
        id: schema.mealItem.id,
        foodId: schema.mealItem.foodId,
        groupId: schema.mealItem.substitutionGroupId,
      })
      .from(schema.mealItem)
      .where(
        and(
          eq(schema.mealItem.mealOptionId, defaultOptionId),
          eq(schema.mealItem.isLocked, false),
        ),
      )
      .orderBy(asc(schema.mealItem.id));
    const flex = flexItems.find((i) => i.groupId !== null);
    if (!flex || flex.groupId === null) {
      throw new Error('seed sem item flexível com grupo na opção default');
    }
    flexItemId = flex.id;
    const flexGroupId = flex.groupId;

    // Substituto DO MESMO grupo (food≠ do item) via food_substitution_group.
    const [same] = await db
      .select({ foodId: schema.foodSubstitutionGroup.foodId })
      .from(schema.foodSubstitutionGroup)
      .where(
        and(
          eq(schema.foodSubstitutionGroup.groupId, flexGroupId),
          ne(schema.foodSubstitutionGroup.foodId, flex.foodId),
        ),
      )
      .limit(1);
    if (!same)
      throw new Error('seed sem substituto no mesmo grupo do flexItem');
    sameGroupFoodId = same.foodId;

    // Food de OUTRO grupo (groupId ≠ do flexItem) → caso 422 fora-do-grupo.
    const [other] = await db
      .select({ foodId: schema.foodSubstitutionGroup.foodId })
      .from(schema.foodSubstitutionGroup)
      .where(ne(schema.foodSubstitutionGroup.groupId, flexGroupId))
      .limit(1);
    if (!other) throw new Error('seed sem food de outro grupo');
    otherGroupFoodId = other.foodId;

    const moduleRef = await Test.createTestingModule({
      imports: [RegistroModule, PlanModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    // pool.end() único do arquivo: a US2 é a última suíte deste e2e-spec.
    await pool.end();
  });

  it('POST feito com items=[substituto do MESMO grupo] → 200, vigente.state="troquei"', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({
        mealId: almocoMealId,
        intent: 'feito',
        consumo: {
          items: [
            {
              itemId: flexItemId,
              foodId: sameGroupFoodId,
              quantityGrams: 120,
            },
          ],
        },
      })
      .expect(200);

    expect(res.body.mealId).toBe(almocoMealId);
    expect(res.body.vigente).toEqual({ state: 'troquei' });

    // desfaz pra não influenciar os casos vizinhos (escopo append-only-limpo).
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: almocoMealId, intent: 'desfazer' })
      .expect(200);
  });

  it('POST feito com chosenOptionId NÃO-default → 200, vigente.state="troquei"', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({
        mealId: almocoMealId,
        intent: 'feito',
        consumo: { chosenOptionId: nonDefaultOptionId },
      })
      .expect(200);

    expect(res.body.vigente).toEqual({ state: 'troquei' });

    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: almocoMealId, intent: 'desfazer' })
      .expect(200);
  });

  it('POST feito com items.foodId de OUTRO grupo → 422 (consumo-fora-do-grupo, DB-resolvido)', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({
        mealId: almocoMealId,
        intent: 'feito',
        consumo: {
          items: [
            {
              itemId: flexItemId,
              foodId: otherGroupFoodId,
              quantityGrams: 120,
            },
          ],
        },
      })
      .expect(422);
  });

  it('POST feito com consumo.items=[] (lista vazia = sem substituição) → feito, não troquei', async () => {
    // items=[] significa "não substituí nada" → SEM adequação → feito (não 422).
    // A casca só monta substituicao-combinacao com itens não-vazio; a guarda de
    // "itens vazio → consumo-invalido" do core é invariante defensiva, coberta no
    // unit de packages/core, não exercível por este payload.
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({
        mealId: almocoMealId,
        intent: 'feito',
        consumo: { items: [] },
      })
      .expect(200);
    expect(res.body.vigente?.state).toBe('feito');
    // desfaz para não vazar estado nas asserções seguintes (append-only).
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: almocoMealId, intent: 'desfazer' })
      .expect(200);
  });
});
