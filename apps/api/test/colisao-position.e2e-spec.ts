import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildScenario,
  everyWeekday,
  localDate,
  type Scenario,
} from '@bamboo/db/testing';
import { CicloModule } from '../src/ciclo/ciclo.module';
import { PlanModule } from '../src/plan/plan.module';
import { RebalanceModule } from '../src/rebalance/rebalance.module';
import { RelatorioModule } from '../src/relatorio/relatorio.module';

// e2e de CARACTERIZAÇÃO do KI-002 — o "teste de colisão" que o ADR-0001 exige
// como precondição para reabrir a decisão da chave de pareamento sob override.
//
// ⚠️ NADA AQUI É O COMPORTAMENTO DESEJADO. Este arquivo pina o comportamento
// ATUAL, incluindo os bugs, para que a eventual correção tenha um oráculo e para
// que a suíte pare de ser cega ao eixo "dois tipos-de-dia com mesma position".
// Quando a decisão de produto vier, as asserções marcadas **[BUG]** devem ser
// invertidas de propósito — falhar aqui é o sinal de que a correção pegou.
//
// O repro publicado no KI-002 (`docs/known-issues.md`) NÃO demonstra o Sintoma A:
// ele registra `pulei` também na pos 2 do tipo exibido, que casa por `mealId`,
// sai das alavancas e mascara o efeito. O repro limpo é **um único** registro
// sob override, e é o que os testes abaixo fazem.
//
// FIXTURE (013): declarado via `buildScenario` — 234 linhas de montagem à mão
// viraram a spec abaixo. O construtor detém a ordem de inserção, a ordem reversa
// de FK do teardown, a data-calendário local e a resolução determinística de
// nutricionista/food/grupo. Nenhum bloco `it` mudou na migração.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const HOJE = localDate();

// Tipo A = programado em todo weekday (o "dia real"). Tipo B = alvo do override.
type Tipo = 'A' | 'B';

let app: INestApplication;
let cenario: Scenario<Tipo>;
let patientId: string;
let cycleId: string;
let dtAId: string;
let dtBId: string;

// Refeições pelo handle do cenário: `meal({dayType, position})` resolve mealId,
// opção padrão e opções nomeadas, e DERIVA plano/paciente/tipo do grafo — nenhum
// id é pareado à mão. `registrarA`/`registrarB` são só açúcar de leitura.
const mealA = (position: number) =>
  cenario.ids.meal({ dayType: 'A', position });
const mealB = (position: number) =>
  cenario.ids.meal({ dayType: 'B', position });

const GATILHO_ALT = 'Alternativa pesada';

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

const postOptionChoice = (triggerMealId: string, chosenOptionId: string) =>
  request(app.getHttpServer())
    .post(`/patients/${patientId}/rebalance/option-choice`)
    .send({ triggerMealId, chosenOptionId });

// Registra HOJE na posição dada, do tipo dado. `dayTypeId`, `planId` e
// `patientId` do evento saem do grafo — a incoerência que o KI-002 investiga é
// inexpressável aqui, e é de propósito: o cenário testa a LEITURA, não a escrita.
const registrarHoje = (
  dayType: Tipo,
  position: number,
  state: 'feito' | 'pulei',
  time: string,
) =>
  cenario.addEvents([{ meal: { dayType, position }, state, daysAgo: 0, time }]);

beforeAll(async () => {
  // A gramatura da alternativa é calibrada (160g vs 100g) para o desvio cair na
  // janela em que o motor devolve `rebalanceado`: com alvo de 300g, tolerância
  // 10% (faixa 270–330) e piso 50%, o excesso de 60g sai da faixa (>30) e cabe
  // nas 2 alavancas restantes (200g, podem encolher 100g no total). 300g daria
  // `recusa-orientada`, cujo corpo NÃO depende do consumo — e aí as comparações
  // dos testes passariam por vacuidade, sem poder de detecção.
  const item = (grams: number) => ({
    food: 'base',
    grams,
    // Grupo por NOME CANÔNICO (antes: `substitutionGroup limit(1)` sem
    // `order by`). O motor só exige `groupId != null` + `locked: false` para o
    // item ser alavanca.
    group: 'Amidos e cereais',
  });
  const posicoes = [1, 2, 3];

  cenario = await buildScenario<Tipo>({
    label: 'colisao-position (e2e KI-002)',
    foods: { base: { minKcalPer100g: 200 } },
    patients: [
      {
        name: 'Cenário Colisão (e2e KI-002)',
        exposure: 'full_kcal',
        // Pina a RÉGUA no paciente. Antes vinha por herança dos defaults da
        // nutricionista semeada (10/50) — acoplamento silencioso: mexer no seed
        // desconfiguraria a calibração acima sem nenhuma pista.
        bandTolerancePct: 10,
        floorPct: 50,
        plans: [
          {
            label: 'P',
            schedule: everyWeekday('A'), // independente do calendário
            dayTypes: [
              {
                label: 'A',
                name: 'A (programado)',
                // Positions 1..3 nos DOIS tipos — é a colisão que a suíte nunca
                // montou antes.
                meals: posicoes.map((position) => ({
                  position,
                  name: `A pos${position}`,
                  options:
                    position === 2
                      ? [
                          { label: 'Padrão', items: [item(100)] },
                          { label: 'Alternativa pesada', items: [item(160)] },
                        ]
                      : [{ label: 'Padrão', items: [item(100)] }],
                })),
              },
              {
                label: 'B',
                name: 'B (override)',
                meals: posicoes.map((position) => ({
                  position,
                  name: `B pos${position}`,
                  options: [{ label: 'Padrão', items: [item(100)] }],
                })),
              },
            ],
          },
        ],
        cycles: [
          {
            label: 'aberto',
            startedDaysAgo: 3,
            expectedDurationDays: 30,
            planWindows: [{ plan: 'P', fromDaysAgo: 3 }],
          },
        ],
      },
    ],
  });

  patientId = cenario.ids.patient();
  cycleId = cenario.ids.cycle('aberto');
  dtAId = cenario.ids.dayType('A');
  dtBId = cenario.ids.dayType('B');

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, RebalanceModule, CicloModule, RelatorioModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

// Cada teste monta seus próprios eventos e os remove — a ordem dos testes não
// pode importar (o motor lê o registro, então evento vazado muda resultado).
afterEach(async () => {
  await cenario.clearEvents();
});

afterAll(async () => {
  await cenario?.destroy(); // ordem reversa de FK é do construtor (I-9)
  await app?.close();
});

// ───────── o cenário é sensível ao consumo (pré-condição do resto) ─────────

describe('KI-002 pré-condição — o cenário produz rebalanceamento de verdade', () => {
  it('escolher a alternativa pesada da pos 2 rebalanceia (senão o resto não detecta nada)', async () => {
    const res = await postOptionChoice(
      mealA(2).mealId,
      mealA(2).option(GATILHO_ALT),
    ).expect(200);
    // Se este dia ficasse DENTRO da faixa, o outcome seria `sem-acao` e o corpo
    // não dependeria do consumo — as comparações abaixo passariam por vacuidade.
    expect(res.body.outcome.kind).toBe('rebalanceado');
    expect(res.body.outcome.refeicoesAfetadas.length).toBeGreaterThan(0);
  });
});

// ───────── Sintoma A do KI-002, repro limpo ─────────

describe('KI-002 Sintoma A — registro sob override é INVISÍVEL ao rebalanceamento', () => {
  it('[BUG] registro na pos 1 do tipo B não muda NADA na prévia do tipo A', async () => {
    const semRegistro = await postOptionChoice(
      mealA(2).mealId,
      mealA(2).option(GATILHO_ALT),
    ).expect(200);

    // Um único registro, sob override (mealId e dayTypeId ambos do tipo B) —
    // exatamente o que `POST /registro` grava quando o app está com o picker em B.
    await registrarHoje('B', 1, 'pulei', '08:00:00');

    const comRegistro = await postOptionChoice(
      mealA(2).mealId,
      mealA(2).option(GATILHO_ALT),
    ).expect(200);

    // [BUG] Corpo IDÊNTICO: o motor pareia por `mealId` (rebalance.service.ts:285),
    // o evento tem mealId do tipo B, e o roster é o do tipo A (`:177`) — então a
    // refeição pulada continua alavanca, com grama planejada, e seu consumo real
    // (zero, no caso do `pulei`) não entra no total. Quando a decisão de produto
    // vier e o pareamento virar por `position`, esta asserção DEVE falhar.
    expect(comRegistro.body).toEqual(semRegistro.body);
  });

  it('CONTROLE — registro na pos 1 do tipo A (mesmo position!) muda a prévia', async () => {
    const semRegistro = await postOptionChoice(
      mealA(2).mealId,
      mealA(2).option(GATILHO_ALT),
    ).expect(200);

    await registrarHoje('A', 1, 'pulei', '08:00:00');

    const comRegistro = await postOptionChoice(
      mealA(2).mealId,
      mealA(2).option(GATILHO_ALT),
    ).expect(200);

    // Prova que o teste TEM poder de detecção: o mesmo fato de domínio ("a
    // refeição da posição 1 foi pulada"), gravado no tipo exibido, muda a
    // resposta. A diferença entre os dois testes é só o tipo-de-dia do evento.
    expect(comRegistro.body).not.toEqual(semRegistro.body);
  });
});

// ───────── o bug NÃO catalogado: a prévia morre sob override ─────────

describe('KI-005 — prévia de rebalanceamento é inalcançável sob override (404)', () => {
  it('[BUG] gatilho numa refeição do tipo B → 404, com ou sem registro', async () => {
    const res = await postOptionChoice(
      mealB(2).mealId,
      mealB(2).defaultOptionId,
    ).expect(404);
    expect(res.body.message).toBe(
      'refeição do gatilho não está no dia corrente',
    );
  });

  it('[BUG] o app alcança esse estado: os chips de opção não são gateados por override', async () => {
    // `HomeScreen.tsx` renderiza `meal.options.map(...)` sem consultar
    // `overrideActive` (só o desfazer do registro é gateado), e o `triggerMealId`
    // enviado é o `meal.id` do cardápio EXIBIDO. Sob `?dayTypeId=B`, todo
    // `meal.id` da tela é do tipo B — logo todo toque em chip cai no 404 acima.
    const today = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: dtBId })
      .expect(200);

    const mealsExibidas = today.body.meals as { id: string }[];
    expect(mealsExibidas.length).toBeGreaterThan(0);
    // Toda refeição exibida sob override é inalcançável pelo rebalanceamento.
    for (const m of mealsExibidas) {
      expect([1, 2, 3].some((p) => mealB(p).mealId === m.id)).toBe(true);
    }
  });
});

// ───────── a divergência na MESMA tela ─────────

describe('KI-002 — /today e o motor discordam sobre o mesmo evento', () => {
  it('[BUG] /today?dayTypeId=A mostra o badge por position; o motor ignora o mesmo evento', async () => {
    await registrarHoje('B', 1, 'pulei', '08:00:00');

    // `/today` COM override pareia por position (009/FR-002) → o badge aparece
    // na pos 1 do tipo A, mesmo o evento sendo do tipo B.
    const comOverride = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: dtAId })
      .expect(200);
    const porPos = new Map(
      (comOverride.body.meals as { position: number; registro: unknown }[]).map(
        (m) => [m.position, m.registro],
      ),
    );
    expect(porPos.get(1)).toEqual({ state: 'pulei' });

    // ...e o motor, na MESMA tela, ignora o mesmo evento (asserido acima). A
    // tela diz "pos 1 pulada"; o rebalanceamento diz "pos 1 é alavanca".
    const rebal = await postOptionChoice(
      mealA(2).mealId,
      mealA(2).option(GATILHO_ALT),
    ).expect(200);
    const afetadas = rebal.body.outcome.refeicoesAfetadas as {
      position: number;
    }[];
    expect(afetadas.some((r) => r.position === 1)).toBe(true);
  });

  it('/today SEM override ignora o evento do tipo B (FR-013a — o padrão nunca auto-ajusta)', async () => {
    await registrarHoje('B', 1, 'pulei', '08:00:00');

    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    // Sem override o pareamento é por `mealId` (o evento é filtrado fora) —
    // aqui `/today` e o motor CONCORDAM, e é requisito (004/FR-013a).
    for (const m of res.body.meals as { registro: unknown }[]) {
      expect(m.registro).toBeNull();
    }
  });
});

// ───────── Sintoma B: colisão de position nas duas rotas da nutri ─────────

describe('KI-002 Sintoma B — colisão de position: as duas rotas da nutri contam diferente', () => {
  it('[BUG] detalhe do ciclo conta 2 registros na pos 1; o relatório conta 1 e perde um estado', async () => {
    // Dois eventos vigentes no MESMO dia e na MESMA position, em tipos-de-dia
    // diferentes. Alcançável: `registro.service` escopa o histórico por `mealId`,
    // então os dois coexistem sem se anular.
    await registrarHoje('A', 1, 'feito', '08:00:00');
    await registrarHoje('B', 1, 'pulei', '09:00:00');

    const detalhe = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cycleId}`,
    ).expect(200);
    const naPos1 = (
      detalhe.body.registros as { date: string; position: number }[]
    ).filter((r) => r.date === HOJE && r.position === 1);
    // Retrato cru por evento: preserva `mealId`, conta os DOIS.
    expect(naPos1).toHaveLength(2);

    const report = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cycleId}/report`,
    ).expect(200);
    const totais = report.body.registro.totais as {
      feito: number;
      troquei: number;
      pulei: number;
      semRegistro: number;
    };
    // Agregado colapsa por position (último-ganha em `relatorio.loader.ts`):
    // conta UM. E o estado perdido não vira `semRegistro` — desaparece dos
    // totais. É o "descarte silencioso": 2 fatos entram, 1 sai.
    expect(totais.feito + totais.troquei + totais.pulei).toBe(1);
  });
});
