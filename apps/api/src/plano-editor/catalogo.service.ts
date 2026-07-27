// Catálogo do editor (017 / US4): alimentos e grupos de substituição.
//
// Existe porque a nutri não consegue pôr um item no plano sem ACHAR o alimento
// entre os ~580 da TACO — a base está semeada desde a Fase 0 e era inalcançável
// por HTTP. E porque a marcação de flexibilidade de um item aponta para um grupo,
// que também não tinha via de leitura.
//
// Duas fronteiras com a Feature 008 (auto-classificação), respeitadas de
// propósito:
//  · alimento criado aqui NÃO tem `taco_id` ⇒ a ingestão TACO (upsert por
//    `taco_id`) nunca o toca, e `source` sai de 'taco';
//  · vínculo criado aqui nasce `origin: 'manual'` ⇒ a classificação automática
//    nunca o sobrescreve. É a mesma convenção da curadoria da fundação.
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
// A régua de busca por nome vive no NÚCLEO (`@bamboo/core/fuzzy`): é a mesma no
// app do paciente e aqui. O banco faz o pré-filtro de subsequência (barato, com as
// linhas na mão) e o núcleo ORDENA por relevância — ordenação que o SQL não sabe
// fazer sem reimplementar a pontuação.
import { buscarFuzzy, caracteresDoTermo } from '@bamboo/core';
import { and, asc, eq, schema, sql } from '@bamboo/db';
import type {
  EquivalenceBasis,
  FoodDto,
  FoodsResponse,
  GrupoDto,
  GruposResponse,
} from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { resolverNutricionista } from '../nutri/nutricionista';
import { recusar } from './cascata';
import {
  numeroNaoNegativo,
  numeroPositivo,
  presente,
  texto,
  umDe,
} from './validar';

const BASES = [
  'carb',
  'protein',
  'fat',
  'kcal',
] as const satisfies ReadonlyArray<EquivalenceBasis>;

const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 600; // a base TACO inteira cabe: a tela usa isso num <select>

/** `source` de alimento cadastrado à mão. Diferente de 'taco' de propósito. */
const SOURCE_MANUAL = 'nutri';

export interface AlimentoBody {
  readonly name?: unknown;
  readonly kcalPer100g?: unknown;
  readonly carbPer100g?: unknown;
  readonly proteinPer100g?: unknown;
  readonly fatPer100g?: unknown;
  readonly fiberPer100g?: unknown;
  readonly sodiumMgPer100g?: unknown;
}

export interface GrupoBody {
  readonly name?: unknown;
  readonly basis?: unknown;
}

/**
 * Busca insensível a caso E a acento, sem extensão do Postgres: `lower` resolve
 * o caso e `translate` dobra as vogais acentuadas do português. Sem isto, "acai"
 * não acha "Açaí" — e é exatamente assim que a nutri digita num campo de busca.
 *
 * A tabela é a MESMA de `normalizarBusca` (`@bamboo/core`), de propósito: é o que
 * garante que o pré-filtro do banco e a pontuação em memória concordem sobre
 * quem casa.
 *
 * ponytail: varredura sequencial sobre ~600 linhas, sem índice — o `translate`
 * impede o uso de índice comum. No tamanho da TACO isso é irrelevante; se a base
 * crescer uma ordem de magnitude, o passo é a extensão `unaccent` + índice
 * `gin_trgm_ops`, não normalizar em memória.
 */
const semAcento = (col: unknown) =>
  sql`translate(lower(${col}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;

/**
 * Query string → inteiro, TOLERANTE: lixo cai no default em vez de 400. É o
 * comportamento que o `limit` já tinha, e um `?offset=abc` que derruba a tela
 * seria pior que uma tela na primeira página.
 */
const inteiro = (v: unknown, padrao: number, min: number, max: number) => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min) return padrao;
  return Math.min(Math.floor(n), max);
};

/**
 * O termo vira um padrão de SUBSEQUÊNCIA: "arroz" → `%a%r%r%o%z%`. É o mesmo
 * casamento que `pontuarFuzzy` faz — só que executado pelo banco, que já tem as
 * linhas. O núcleo depois só ORDENA o que voltou.
 *
 * `%`, `_` e `\` digitados pelo usuário viram literais: sem isso "100%" casaria
 * com a base inteira e a tela mostraria isso como resultado de busca.
 */
const padraoSubsequencia = (termo: string): string =>
  `%${[...caracteresDoTermo(termo)]
    .map((c) => c.replace(/[%_\\]/g, '\\$&'))
    .join('%')}%`;

@Injectable()
export class CatalogoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /* ═══════════ alimentos ═══════════ */

  /**
   * Busca + página. A ordenação é por RELEVÂNCIA, que o banco não conhece — por
   * isso a fatia é feita em memória e não com `OFFSET` no SQL, que pularia pela
   * ordem errada. O conjunto casado cabe (a TACO inteira são ~600 linhas); é o
   * mesmo teto que o `ponytail:` do `semAcento` já declarava.
   */
  async buscarAlimentos(
    qRaw: unknown,
    limitRaw: unknown,
    offsetRaw?: unknown,
  ): Promise<FoodsResponse> {
    const q = typeof qRaw === 'string' ? qRaw.trim() : '';
    const limit = inteiro(limitRaw, LIMITE_DEFAULT, 1, LIMITE_MAX);
    const offset = inteiro(offsetRaw, 0, 0, Number.MAX_SAFE_INTEGER);

    // `q` vazio devolve a primeira página, não erro: é o estado inicial da tela.
    const filtro =
      q.length === 0
        ? undefined
        : sql`${semAcento(schema.food.name)} like ${padraoSubsequencia(q)}`;

    // Ordem determinística ANTES do fuzzy: `buscarFuzzy` é estável, então o
    // desempate de relevância é este `(name, id)` — o `, id` é a lição da 012.
    const linhas = await this.db
      .select({
        id: schema.food.id,
        name: schema.food.name,
        source: schema.food.source,
        tacoCategory: schema.food.tacoCategory,
        kcalPer100g: schema.food.kcalPer100g,
        carbPer100g: schema.food.carbPer100g,
        proteinPer100g: schema.food.proteinPer100g,
        fatPer100g: schema.food.fatPer100g,
        fiberPer100g: schema.food.fiberPer100g,
        sodiumMgPer100g: schema.food.sodiumMgPer100g,
      })
      .from(schema.food)
      .where(filtro)
      .orderBy(asc(schema.food.name), asc(schema.food.id));

    // O filtro do banco já é o teste de subsequência: aqui o núcleo só reordena.
    const casaram = buscarFuzzy(linhas, q, (f) => f.name);

    return {
      foods: casaram.slice(offset, offset + limit),
      total: casaram.length,
    };
  }

  async criarAlimento(body: AlimentoBody): Promise<FoodDto> {
    const values = {
      name: texto(body?.name, 'name', 200),
      // Sem `tacoId` e com `source` != 'taco': a ingestão da 008 faz upsert por
      // `taco_id`, então este alimento fica fora do alcance dela para sempre.
      source: SOURCE_MANUAL,
      kcalPer100g: numeroNaoNegativo(body?.kcalPer100g, 'kcalPer100g', 900),
      carbPer100g: numeroNaoNegativo(body?.carbPer100g, 'carbPer100g', 100),
      proteinPer100g: numeroNaoNegativo(
        body?.proteinPer100g,
        'proteinPer100g',
        100,
      ),
      fatPer100g: numeroNaoNegativo(body?.fatPer100g, 'fatPer100g', 100),
      fiberPer100g: presente(body, 'fiberPer100g')
        ? body.fiberPer100g === null
          ? null
          : numeroNaoNegativo(body.fiberPer100g, 'fiberPer100g', 100)
        : null,
      // Sódio em mg: teto 40000 (sal de cozinha é ~39 g de sódio por 100 g), e
      // não os 100 dos macros em grama — o mesmo teto ali barraria o sal.
      sodiumMgPer100g: presente(body, 'sodiumMgPer100g')
        ? body.sodiumMgPer100g === null
          ? null
          : numeroNaoNegativo(body.sodiumMgPer100g, 'sodiumMgPer100g', 40000)
        : null,
    };

    const [row] = await this.db
      .insert(schema.food)
      .values(values)
      .returning({ id: schema.food.id });
    if (!row) {
      throw new InternalServerErrorException('insert não devolveu o alimento');
    }
    return this.exigirAlimento(row.id);
  }

  async atualizarAlimento(
    foodId: string,
    body: AlimentoBody,
  ): Promise<FoodDto> {
    await this.exigirAlimento(foodId);

    const patch: Record<string, unknown> = {};
    if (presente(body, 'name')) patch.name = texto(body.name, 'name', 200);
    for (const [campo, max] of [
      ['kcalPer100g', 900],
      ['carbPer100g', 100],
      ['proteinPer100g', 100],
      ['fatPer100g', 100],
    ] as const) {
      if (presente(body, campo)) {
        patch[campo] = numeroNaoNegativo(body[campo], campo, max);
      }
    }
    if (presente(body, 'fiberPer100g')) {
      patch.fiberPer100g =
        body.fiberPer100g === null
          ? null
          : numeroNaoNegativo(body.fiberPer100g, 'fiberPer100g', 100);
    }
    if (presente(body, 'sodiumMgPer100g')) {
      patch.sodiumMgPer100g =
        body.sodiumMgPer100g === null
          ? null
          : numeroNaoNegativo(body.sodiumMgPer100g, 'sodiumMgPer100g', 40000);
    }

    if (Object.keys(patch).length > 0) {
      await this.db
        .update(schema.food)
        .set(patch)
        .where(eq(schema.food.id, foodId));
    }
    return this.exigirAlimento(foodId);
  }

  /**
   * Exclui o alimento e o que só existe por causa dele (vínculos de grupo,
   * medidas caseiras). Recusa se algum plano ou registro o usa — um item de plano
   * sem alimento não é um item, e um snapshot de registro sem alimento perde o
   * que o paciente comeu.
   */
  async excluirAlimento(foodId: string): Promise<void> {
    await this.exigirAlimento(foodId);

    await this.db.transaction(async (tx) => {
      const [noPlano] = await tx
        .select({ id: schema.mealItem.id })
        .from(schema.mealItem)
        .where(eq(schema.mealItem.foodId, foodId))
        .limit(1);
      if (noPlano) {
        recusar(
          'este alimento está em algum plano: troque-o nos itens antes de apagá-lo do catálogo.',
        );
      }

      const [noRegistro] = await tx
        .select({ id: schema.mealEventItem.id })
        .from(schema.mealEventItem)
        .where(eq(schema.mealEventItem.foodId, foodId))
        .limit(1);
      if (noRegistro) {
        recusar(
          'este alimento aparece no registro de alguma refeição: é ele que diz o que o paciente comeu naquele dia.',
        );
      }

      await tx
        .delete(schema.foodSubstitutionGroup)
        .where(eq(schema.foodSubstitutionGroup.foodId, foodId));
      await tx
        .delete(schema.foodHouseholdMeasure)
        .where(eq(schema.foodHouseholdMeasure.foodId, foodId));
      await tx.delete(schema.food).where(eq(schema.food.id, foodId));
    });
  }

  /* ═══════════ grupos de substituição ═══════════ */

  /** Todos os grupos com os alimentos vinculados — a tela precisa dos dois para
   *  oferecer "flexível dentro de qual grupo". */
  async listarGrupos(): Promise<GruposResponse> {
    const grupos = await this.db
      .select({
        id: schema.substitutionGroup.id,
        name: schema.substitutionGroup.name,
        basis: schema.substitutionGroup.basis,
        nutritionistId: schema.substitutionGroup.nutritionistId,
      })
      .from(schema.substitutionGroup)
      .orderBy(
        asc(schema.substitutionGroup.name),
        asc(schema.substitutionGroup.id),
      );

    const vinculos = await this.db
      .select({
        groupId: schema.foodSubstitutionGroup.groupId,
        foodId: schema.foodSubstitutionGroup.foodId,
        foodName: schema.food.name,
        referencePortionGrams:
          schema.foodSubstitutionGroup.referencePortionGrams,
        origin: schema.foodSubstitutionGroup.origin,
      })
      .from(schema.foodSubstitutionGroup)
      .innerJoin(
        schema.food,
        eq(schema.food.id, schema.foodSubstitutionGroup.foodId),
      )
      .orderBy(asc(schema.food.name), asc(schema.food.id));

    return {
      groups: grupos.map((g) => ({
        id: g.id,
        name: g.name,
        basis: g.basis,
        custom: g.nutritionistId !== null,
        foods: vinculos
          .filter((v) => v.groupId === g.id)
          .map((v) => ({
            foodId: v.foodId,
            foodName: v.foodName,
            referencePortionGrams: v.referencePortionGrams,
            origin: v.origin,
          })),
      })),
    };
  }

  async criarGrupo(body: GrupoBody): Promise<GrupoDto> {
    const name = texto(body?.name, 'name');
    const basis = umDe(body?.basis, 'basis', BASES);
    // Grupo criado pela nutri é DELA (`custom: true`): os grupos do sistema são a
    // taxonomia canônica que a auto-classificação (008) mantém.
    const nutritionistId = await resolverNutricionista(this.db);

    const [row] = await this.db
      .insert(schema.substitutionGroup)
      .values({ name, basis, nutritionistId })
      .returning({ id: schema.substitutionGroup.id });
    if (!row) {
      throw new InternalServerErrorException('insert não devolveu o grupo');
    }
    return this.exigirGrupo(row.id);
  }

  async atualizarGrupo(groupId: string, body: GrupoBody): Promise<GrupoDto> {
    await this.exigirGrupo(groupId);

    const patch: Record<string, unknown> = {};
    if (presente(body, 'name')) patch.name = texto(body.name, 'name');
    if (presente(body, 'basis')) {
      patch.basis = umDe(body.basis, 'basis', BASES);
    }

    if (Object.keys(patch).length > 0) {
      await this.db
        .update(schema.substitutionGroup)
        .set(patch)
        .where(eq(schema.substitutionGroup.id, groupId));
    }
    return this.exigirGrupo(groupId);
  }

  async excluirGrupo(groupId: string): Promise<void> {
    await this.exigirGrupo(groupId);

    await this.db.transaction(async (tx) => {
      const [emUso] = await tx
        .select({ id: schema.mealItem.id })
        .from(schema.mealItem)
        .where(eq(schema.mealItem.substitutionGroupId, groupId))
        .limit(1);
      if (emUso) {
        recusar(
          'algum item de plano é flexível dentro deste grupo: mude a marcação desses itens antes de apagá-lo.',
        );
      }

      await tx
        .delete(schema.foodSubstitutionGroup)
        .where(eq(schema.foodSubstitutionGroup.groupId, groupId));
      await tx
        .delete(schema.substitutionGroup)
        .where(eq(schema.substitutionGroup.id, groupId));
    });
  }

  /**
   * Vincula (ou revincula) alimento↔grupo com a porção de referência — a "1
   * troca" do exchange. `PUT` porque o par (grupo, alimento) é a identidade: o
   * mesmo alimento não entra duas vezes no mesmo grupo.
   */
  async vincular(
    groupId: string,
    foodId: string,
    body: { readonly referencePortionGrams?: unknown },
  ): Promise<GrupoDto> {
    await this.exigirGrupo(groupId);
    await this.exigirAlimento(foodId);
    const referencePortionGrams = numeroPositivo(
      body?.referencePortionGrams,
      'referencePortionGrams',
      5000,
    );

    await this.db.transaction(async (tx) => {
      const [existente] = await tx
        .select({ id: schema.foodSubstitutionGroup.id })
        .from(schema.foodSubstitutionGroup)
        .where(
          and(
            eq(schema.foodSubstitutionGroup.groupId, groupId),
            eq(schema.foodSubstitutionGroup.foodId, foodId),
          ),
        )
        .limit(1);

      if (existente) {
        await tx
          .update(schema.foodSubstitutionGroup)
          // Editar à mão promove o vínculo a curadoria: a classificação
          // automática não sobrescreve `origin: 'manual'`.
          .set({ referencePortionGrams, origin: 'manual' })
          .where(eq(schema.foodSubstitutionGroup.id, existente.id));
      } else {
        await tx.insert(schema.foodSubstitutionGroup).values({
          groupId,
          foodId,
          referencePortionGrams,
          origin: 'manual',
        });
      }
    });

    return this.exigirGrupo(groupId);
  }

  async desvincular(groupId: string, foodId: string): Promise<GrupoDto> {
    await this.exigirGrupo(groupId);

    // Um item marcado como "flexível dentro deste grupo" e feito DESTE alimento
    // perderia a porção de referência — a troca ficaria sem como reescalar.
    const [emUso] = await this.db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(
        and(
          eq(schema.mealItem.foodId, foodId),
          eq(schema.mealItem.substitutionGroupId, groupId),
        ),
      )
      .limit(1);
    if (emUso) {
      recusar(
        'há item de plano deste alimento marcado como flexível dentro deste grupo: sem o vínculo a troca perderia a porção de referência.',
      );
    }

    await this.db
      .delete(schema.foodSubstitutionGroup)
      .where(
        and(
          eq(schema.foodSubstitutionGroup.groupId, groupId),
          eq(schema.foodSubstitutionGroup.foodId, foodId),
        ),
      );

    return this.exigirGrupo(groupId);
  }

  /* ═══════════ resolução / 404 ═══════════ */

  private async exigirAlimento(foodId: string): Promise<FoodDto> {
    const [f] = await this.db
      .select({
        id: schema.food.id,
        name: schema.food.name,
        source: schema.food.source,
        tacoCategory: schema.food.tacoCategory,
        kcalPer100g: schema.food.kcalPer100g,
        carbPer100g: schema.food.carbPer100g,
        proteinPer100g: schema.food.proteinPer100g,
        fatPer100g: schema.food.fatPer100g,
        fiberPer100g: schema.food.fiberPer100g,
        sodiumMgPer100g: schema.food.sodiumMgPer100g,
      })
      .from(schema.food)
      .where(eq(schema.food.id, foodId))
      .limit(1);
    if (!f) throw new NotFoundException('alimento não encontrado');
    return f;
  }

  private async exigirGrupo(groupId: string): Promise<GrupoDto> {
    const { groups } = await this.listarGrupos();
    const g = groups.find((x) => x.id === groupId);
    if (!g) throw new NotFoundException('grupo de substituição não encontrado');
    return g;
  }
}
