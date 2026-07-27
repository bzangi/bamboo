// Casca da Feature 015 — a roster da nutri. Só leitura, uma query, nenhuma
// régua: quem calcula adesão é a 006, quem monta relatório é a 011.
//
// O "ciclo atual" (D2) é o aberto; se não houver, o fechado mais recente. A
// escolha é feita pela ORDEM da query (o primeiro registro de cada paciente já é
// o vencedor) — ordenação explícita, nunca a ordem que o heap devolver: é a
// mesma lição do `, id` da 012 e do I-2 da 013.
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ExposureLevel,
  NutriPatientDetalheDto,
  NutriPatientDto,
  NutriPatientsResponse,
} from '@bamboo/types';
import { asc, desc, eq, schema, sql } from '@bamboo/db';
import { DB, type Db } from '../db/db.module';
import {
  apagarCiclosDoPaciente,
  apagarGrafoDosPlanos,
  recusar,
} from '../plano-editor/cascata';
import {
  numeroPositivoOuNulo,
  presente,
  texto,
  textoOuNulo,
  umDe,
} from '../plano-editor/validar';

/** Limite de `name`. Não é regra de negócio, é sanidade de borda. */
const NOME_MAX = 120;

/** Os quatro níveis do enum `exposure_level` do schema. */
const NIVEIS_EXPOSICAO = [
  'hidden',
  'percent',
  'macros',
  'full_kcal',
] as const satisfies ReadonlyArray<ExposureLevel>;

/** Corpo do PATCH da ficha (017). Tudo opcional; `null` limpa. */
export interface AtualizarPacienteBody {
  readonly name?: unknown;
  readonly email?: unknown;
  readonly phone?: unknown;
  readonly heightCm?: unknown;
  readonly weightKg?: unknown;
  readonly exposure?: unknown;
}

/** Linha do join: um paciente × (0..n) ciclos. */
interface RosterRow {
  readonly patientId: string;
  readonly name: string;
  readonly cycleId: string | null;
  readonly startedOn: string | null;
  readonly closedOn: string | null;
  readonly expectedDurationDays: number | null;
}

/**
 * Colapsa o join em um DTO por paciente: a PRIMEIRA linha de cada paciente é o
 * ciclo atual (a query já ordenou). Função pura — o teste do endpoint (e2e)
 * cobre a ordem; esta função só descarta o resto.
 */
export function toRoster(
  rows: ReadonlyArray<RosterRow>,
): ReadonlyArray<NutriPatientDto> {
  const vistos = new Set<string>();
  return rows.flatMap((r) => {
    if (vistos.has(r.patientId)) return [];
    vistos.add(r.patientId);
    return [
      {
        id: r.patientId,
        name: r.name,
        // Minimização (FR-004): nada além de nome + ciclo sai daqui.
        cicloAtual:
          r.cycleId === null ||
          r.startedOn === null ||
          r.expectedDurationDays === null
            ? null
            : {
                id: r.cycleId,
                startedOn: r.startedOn,
                closedOn: r.closedOn,
                expectedDurationDays: r.expectedDurationDays,
                aberto: r.closedOn === null,
              },
      },
    ];
  });
}

@Injectable()
export class PatientsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listar(): Promise<NutriPatientsResponse> {
    const rows = await this.db
      .select({
        patientId: schema.patient.id,
        name: schema.patient.name,
        cycleId: schema.cycle.id,
        startedOn: schema.cycle.startedOn,
        closedOn: schema.cycle.closedOn,
        expectedDurationDays: schema.cycle.expectedDurationDays,
      })
      .from(schema.patient)
      .leftJoin(schema.cycle, eq(schema.cycle.patientId, schema.patient.id))
      .orderBy(
        asc(schema.patient.name),
        asc(schema.patient.id), // desempate de nomes iguais (FR-003)
        // Aberto primeiro (closed_on nulo), depois o fechamento mais recente.
        // NULLS FIRST é explícito de propósito: o default do Postgres para DESC
        // já seria esse, e depender de default é como se perde determinismo.
        sql`${schema.cycle.closedOn} DESC NULLS FIRST`,
        desc(schema.cycle.startedOn),
        asc(schema.cycle.id),
      );

    return { patients: toRoster(rows) };
  }

  /**
   * Cadastra um paciente (016). Escreve UMA tabela: nem plano, nem ciclo, nem
   * programação — quem inventa grafo no cadastro cria plano fantasma.
   *
   * Coleta mínima (LGPD): só `name`. E-mail, telefone, peso e altura existem no
   * schema e continuam nulos porque nada os consome hoje.
   */
  async criar(nameRaw: unknown): Promise<NutriPatientDto> {
    // Validação ESTRUTURAL na borda (padrão da casca: o repo não tem
    // class-validator/ValidationPipe — ver ciclo.controller.ts).
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
    if (name.length === 0 || name.length > NOME_MAX) {
      throw new BadRequestException(
        `name é obrigatório: texto de 1 a ${NOME_MAX} caracteres`,
      );
    }

    // `limit(2)` distingue os três casos numa query só. NÃO usar `limit(1)`:
    // pendurar dado de saúde na nutricionista errada é pior que falhar.
    const [nutri, segunda] = await this.db
      .select({ id: schema.nutritionist.id })
      .from(schema.nutritionist)
      .orderBy(asc(schema.nutritionist.createdAt), asc(schema.nutritionist.id))
      .limit(2);

    if (!nutri) {
      throw new UnprocessableEntityException(
        'nenhuma nutricionista cadastrada: rode o seed (pnpm --filter @bamboo/db exec node --env-file=../../.env --import tsx scripts/seed.ts)',
      );
    }
    if (segunda) {
      throw new UnprocessableEntityException(
        'mais de uma nutricionista cadastrada: a credencial stub não distingue qual é a responsável pelo paciente — isso entra com a auth real',
      );
    }

    const [row] = await this.db
      .insert(schema.patient)
      .values({ nutritionistId: nutri.id, name })
      .returning({ id: schema.patient.id, name: schema.patient.name });

    if (!row) {
      throw new InternalServerErrorException('insert não devolveu o paciente');
    }

    // Mesma forma do item da listagem (D3): o cliente insere na lista sem uma
    // segunda chamada, e não nasce um segundo formato para "paciente".
    return { id: row.id, name: row.name, cicloAtual: null };
  }

  /**
   * A ficha de UM paciente (017). Existe porque o formulário de edição precisa
   * preencher os campos com o que está lá — a minimização da 015 vale para a
   * LISTAGEM, e um formulário cego não consegue nem limpar um campo.
   *
   * Sem `cicloAtual` de propósito: a regra de "qual ciclo mostrar" (015/D2) fica
   * na roster e em nenhum outro lugar.
   */
  async detalhe(patientId: string): Promise<NutriPatientDetalheDto> {
    const [p] = await this.db
      .select({
        id: schema.patient.id,
        name: schema.patient.name,
        email: schema.patient.email,
        phone: schema.patient.phone,
        heightCm: schema.patient.heightCm,
        weightKg: schema.patient.weightKg,
        exposure: schema.patient.exposure,
      })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);

    if (!p) throw new NotFoundException('paciente não encontrado');
    return p;
  }

  /**
   * PATCH parcial da ficha (017 / US1). Campo ausente preserva; `null` limpa.
   * A distinção vem da PRESENÇA da chave, não do valor — `body.email ===
   * undefined` não separa "não mandou" de "mandou null" (D7).
   */
  async atualizar(
    patientId: string,
    body: AtualizarPacienteBody,
  ): Promise<NutriPatientDetalheDto> {
    await this.detalhe(patientId); // 404 antes de validar corpo

    const patch: Record<string, unknown> = {};
    if (presente(body, 'name')) patch.name = texto(body.name, 'name', NOME_MAX);
    if (presente(body, 'email')) {
      patch.email = textoOuNulo(body.email, 'email', 254);
    }
    if (presente(body, 'phone')) {
      patch.phone = textoOuNulo(body.phone, 'phone', 32);
    }
    if (presente(body, 'heightCm')) {
      patch.heightCm = numeroPositivoOuNulo(body.heightCm, 'heightCm', 300);
    }
    if (presente(body, 'weightKg')) {
      patch.weightKg = numeroPositivoOuNulo(body.weightKg, 'weightKg', 700);
    }
    if (presente(body, 'exposure')) {
      patch.exposure = umDe(body.exposure, 'exposure', NIVEIS_EXPOSICAO);
    }

    // Corpo sem nenhum campo conhecido: no-op, não erro. A tela manda o
    // formulário inteiro e nem sempre há mudança.
    if (Object.keys(patch).length > 0) {
      await this.db
        .update(schema.patient)
        .set(patch)
        .where(eq(schema.patient.id, patientId));
    }

    return this.detalhe(patientId);
  }

  /**
   * Exclui o paciente e tudo que só existe por causa dele: planos e o grafo
   * inteiro abaixo, ciclos e vigências.
   *
   * RECUSA (409) se houver `meal_event`. A checagem é direta em
   * `meal_event.patient_id` — não pela lista de refeições dos planos atuais —
   * porque um registro de plano já apagado ainda é histórico do paciente.
   */
  async excluir(patientId: string): Promise<void> {
    await this.detalhe(patientId); // 404

    await this.db.transaction(async (tx) => {
      const [registro] = await tx
        .select({ id: schema.mealEvent.id })
        .from(schema.mealEvent)
        .where(eq(schema.mealEvent.patientId, patientId))
        .limit(1);

      if (registro) {
        recusar(
          'este paciente tem registro de refeição: o histórico não é apagado por exclusão de cadastro. Exclua os registros primeiro, se for realmente essa a intenção.',
        );
      }

      const planos = await tx
        .select({ id: schema.plan.id })
        .from(schema.plan)
        .where(eq(schema.plan.patientId, patientId));

      await apagarGrafoDosPlanos(
        tx,
        planos.map((p) => p.id),
      );
      // Vigências referenciam ciclo E plano, então os ciclos saem antes do plano.
      await apagarCiclosDoPaciente(tx, patientId);
      await tx.delete(schema.plan).where(eq(schema.plan.patientId, patientId));
      await tx.delete(schema.patient).where(eq(schema.patient.id, patientId));
    });
  }
}
