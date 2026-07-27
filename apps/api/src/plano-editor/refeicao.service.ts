// Casca do editor: refeição → opção → item (017 / US3).
//
// Duas invariantes vivem aqui, e são as únicas coisas neste arquivo que não são
// insert/update/delete direto:
//
//  · `(day_type, position)` é ÚNICO. Position é a chave de pareamento entre
//    tipos-de-dia usada pela troca de tipo-de-dia (009/012): duas refeições na
//    mesma posição corromperiam esse pareamento silenciosamente. O schema não tem
//    a constraint, então a casca a garante — com teste.
//  · EXATAMENTE UMA opção default por refeição. O app mostra a default; refeição
//    com zero default não tem o que mostrar, com duas mostra a que o heap
//    devolver primeiro.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq, ne, schema } from '@bamboo/db';
import type {
  PlanoItemDto,
  PlanoOpcaoDto,
  PlanoRefeicaoDto,
} from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import {
  apagarOpcoes,
  apagarRefeicoes,
  recusar,
  temRegistroNasRefeicoes,
  type Tx,
} from './cascata';
import {
  acharItem,
  acharOpcao,
  acharRefeicao,
  carregarPlano,
  planIdDaOpcao,
  planIdDaRefeicao,
  planIdDoItem,
} from './plano.leitura';
import {
  booleano,
  horario,
  inteiroEntre,
  numeroPositivo,
  presente,
  texto,
} from './validar';

export interface RefeicaoBody {
  readonly name?: unknown;
  readonly position?: unknown;
  readonly horario?: unknown;
}

export interface OpcaoBody {
  readonly label?: unknown;
  readonly isDefault?: unknown;
}

export interface ItemBody {
  readonly foodId?: unknown;
  readonly quantityGrams?: unknown;
  readonly isLocked?: unknown;
  readonly substitutionGroupId?: unknown;
}

/** Teto de `position`: um dia com mais de 30 refeições é erro de digitação. */
const POSITION_MAX = 30;

@Injectable()
export class RefeicaoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /* ═══════════ refeição ═══════════ */

  async criarRefeicao(
    dayTypeId: string,
    body: RefeicaoBody,
  ): Promise<PlanoRefeicaoDto> {
    const planId = await this.exigirPlanoDoTipo(dayTypeId);
    const name = texto(body?.name, 'name');
    const position = inteiroEntre(body?.position, 'position', 1, POSITION_MAX);
    const hora = presente(body, 'horario')
      ? horario(body.horario, 'horario')
      : null;

    await this.exigirPositionLivre(this.db, dayTypeId, position, null);

    const [row] = await this.db
      .insert(schema.meal)
      .values({ dayTypeId, name, position, horario: hora })
      .returning({ id: schema.meal.id });
    if (!row) {
      throw new InternalServerErrorException('insert não devolveu a refeição');
    }

    return this.relerRefeicao(planId, row.id);
  }

  async atualizarRefeicao(
    mealId: string,
    body: RefeicaoBody,
  ): Promise<PlanoRefeicaoDto> {
    const { planId, dayTypeId } = await this.exigirRefeicao(mealId);

    const patch: Record<string, unknown> = {};
    if (presente(body, 'name')) patch.name = texto(body.name, 'name');
    if (presente(body, 'horario')) {
      patch.horario = horario(body.horario, 'horario');
    }
    if (presente(body, 'position')) {
      const position = inteiroEntre(body.position, 'position', 1, POSITION_MAX);
      await this.exigirPositionLivre(this.db, dayTypeId, position, mealId);
      patch.position = position;
    }

    if (Object.keys(patch).length > 0) {
      await this.db
        .update(schema.meal)
        .set(patch)
        .where(eq(schema.meal.id, mealId));
    }
    return this.relerRefeicao(planId, mealId);
  }

  async excluirRefeicao(mealId: string): Promise<void> {
    await this.exigirRefeicao(mealId);

    await this.db.transaction(async (tx) => {
      if (await temRegistroNasRefeicoes(tx, [mealId])) {
        recusar(
          'há registro de refeição nesta refeição: o histórico não é apagado junto com o plano. Edite as opções em vez de apagar a refeição.',
        );
      }
      await apagarRefeicoes(tx, [mealId]);
    });
  }

  /* ═══════════ opção ═══════════ */

  /**
   * A PRIMEIRA opção de uma refeição nasce default mesmo sem pedir: refeição com
   * opções e nenhuma default não tem o que mostrar no app. Da segunda em diante,
   * default só com `isDefault: true` — e então as irmãs são desmarcadas.
   */
  async criarOpcao(mealId: string, body: OpcaoBody): Promise<PlanoOpcaoDto> {
    const { planId } = await this.exigirRefeicao(mealId);
    const label = texto(body?.label, 'label');
    const pedeDefault = presente(body, 'isDefault')
      ? booleano(body.isDefault, 'isDefault')
      : false;

    const id = await this.db.transaction(async (tx) => {
      const irmas = await tx
        .select({ id: schema.mealOption.id })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, mealId));

      const vaiSerDefault = pedeDefault || irmas.length === 0;
      if (vaiSerDefault && irmas.length > 0) {
        await this.desmarcarDefaults(tx, mealId, null);
      }

      const [row] = await tx
        .insert(schema.mealOption)
        .values({ mealId, label, isDefault: vaiSerDefault })
        .returning({ id: schema.mealOption.id });
      if (!row) {
        throw new InternalServerErrorException('insert não devolveu a opção');
      }
      return row.id;
    });

    return this.relerOpcao(planId, id);
  }

  async atualizarOpcao(
    optionId: string,
    body: OpcaoBody,
  ): Promise<PlanoOpcaoDto> {
    const { planId, mealId, isDefault } = await this.exigirOpcao(optionId);

    await this.db.transaction(async (tx) => {
      if (presente(body, 'label')) {
        await tx
          .update(schema.mealOption)
          .set({ label: texto(body.label, 'label') })
          .where(eq(schema.mealOption.id, optionId));
      }

      if (presente(body, 'isDefault')) {
        const querDefault = booleano(body.isDefault, 'isDefault');
        if (querDefault) {
          await this.desmarcarDefaults(tx, mealId, optionId);
          await tx
            .update(schema.mealOption)
            .set({ isDefault: true })
            .where(eq(schema.mealOption.id, optionId));
        } else if (isDefault) {
          // Desmarcar a única default deixaria a refeição sem padrão. Marcar
          // OUTRA como padrão é o caminho — e desmarca esta de lambuja.
          throw new ConflictException(
            'esta é a opção padrão da refeição: marque outra como padrão em vez de desmarcar esta.',
          );
        }
      }
    });

    return this.relerOpcao(planId, optionId);
  }

  /**
   * Recusa a exclusão da ÚNICA opção (refeição sem opção não tem o que mostrar)
   * e da opção que algum registro diz ter sido cumprida. Se a excluída era a
   * default, promove outra no mesmo ato.
   */
  async excluirOpcao(optionId: string): Promise<void> {
    const { mealId, isDefault } = await this.exigirOpcao(optionId);

    await this.db.transaction(async (tx) => {
      const irmas = await tx
        .select({ id: schema.mealOption.id })
        .from(schema.mealOption)
        .where(
          and(
            eq(schema.mealOption.mealId, mealId),
            ne(schema.mealOption.id, optionId),
          ),
        )
        .orderBy(asc(schema.mealOption.label), asc(schema.mealOption.id));

      if (irmas.length === 0) {
        recusar(
          'esta é a única opção da refeição: uma refeição sem opção não tem o que mostrar ao paciente. Apague a refeição, ou crie outra opção antes.',
        );
      }

      const [registro] = await tx
        .select({ id: schema.mealEvent.id })
        .from(schema.mealEvent)
        .where(eq(schema.mealEvent.chosenMealOptionId, optionId))
        .limit(1);
      if (registro) {
        recusar(
          'há registro de refeição apontando para esta opção: é ela que explica o que o paciente comeu naquele dia.',
        );
      }

      await apagarOpcoes(tx, [optionId]);

      if (isDefault) {
        await tx
          .update(schema.mealOption)
          .set({ isDefault: true })
          .where(eq(schema.mealOption.id, irmas[0].id));
      }
    });
  }

  /* ═══════════ item ═══════════ */

  async criarItem(optionId: string, body: ItemBody): Promise<PlanoItemDto> {
    const { planId } = await this.exigirOpcao(optionId);
    const foodId = texto(body?.foodId, 'foodId', 64);
    const quantityGrams = numeroPositivo(
      body?.quantityGrams,
      'quantityGrams',
      5000,
    );
    const { isLocked, substitutionGroupId } = this.flexibilidade(body);

    await this.exigirAlimento(foodId);
    if (substitutionGroupId !== null) {
      await this.exigirVinculo(foodId, substitutionGroupId);
    }

    const [row] = await this.db
      .insert(schema.mealItem)
      .values({
        mealOptionId: optionId,
        foodId,
        quantityGrams,
        isLocked,
        substitutionGroupId,
      })
      .returning({ id: schema.mealItem.id });
    if (!row) {
      throw new InternalServerErrorException('insert não devolveu o item');
    }

    return this.relerItem(planId, row.id);
  }

  async atualizarItem(itemId: string, body: ItemBody): Promise<PlanoItemDto> {
    const atual = await this.exigirItem(itemId);

    const foodId = presente(body, 'foodId')
      ? texto(body.foodId, 'foodId', 64)
      : atual.foodId;
    // A marcação de flexibilidade é decidida em CONJUNTO: travado e grupo são
    // contraditórios, então avaliar um sem o outro deixaria passar a combinação
    // proibida num PATCH que só manda um dos dois.
    const alvo = {
      isLocked: presente(body, 'isLocked') ? body.isLocked : atual.isLocked,
      substitutionGroupId: presente(body, 'substitutionGroupId')
        ? body.substitutionGroupId
        : atual.substitutionGroupId,
    };
    const { isLocked, substitutionGroupId } = this.flexibilidade(alvo);

    const patch: Record<string, unknown> = { isLocked, substitutionGroupId };
    if (presente(body, 'foodId')) {
      await this.exigirAlimento(foodId);
      patch.foodId = foodId;
    }
    if (presente(body, 'quantityGrams')) {
      patch.quantityGrams = numeroPositivo(
        body.quantityGrams,
        'quantityGrams',
        5000,
      );
    }
    if (substitutionGroupId !== null) {
      await this.exigirVinculo(foodId, substitutionGroupId);
    }

    await this.db
      .update(schema.mealItem)
      .set(patch)
      .where(eq(schema.mealItem.id, itemId));

    return this.relerItem(atual.planId, itemId);
  }

  async excluirItem(itemId: string): Promise<void> {
    await this.exigirItem(itemId);
    // Nada aponta para `meal_item`: `meal_event_item` referencia `food`. Então
    // não há bloqueador — o item sai sem cascata e sem recusa.
    await this.db.delete(schema.mealItem).where(eq(schema.mealItem.id, itemId));
  }

  /* ═══════════ regras compartilhadas ═══════════ */

  /**
   * `isLocked` e `substitutionGroupId` são a marcação de flexibilidade INTEIRA, e
   * são mutuamente exclusivos: travado não troca, então apontar um grupo para ele
   * é uma instrução contraditória — recusada, não "resolvida" por precedência.
   */
  private flexibilidade(body: {
    readonly isLocked?: unknown;
    readonly substitutionGroupId?: unknown;
  }): { isLocked: boolean; substitutionGroupId: string | null } {
    const isLocked = presente(body, 'isLocked')
      ? booleano(body.isLocked, 'isLocked')
      : false;
    const grupoRaw = presente(body, 'substitutionGroupId')
      ? body.substitutionGroupId
      : null;
    const substitutionGroupId =
      grupoRaw === null || grupoRaw === ''
        ? null
        : texto(grupoRaw, 'substitutionGroupId', 64);

    if (isLocked && substitutionGroupId !== null) {
      throw new BadRequestException(
        'isLocked e substitutionGroupId são contraditórios: item travado não troca. Escolha um dos dois.',
      );
    }
    return { isLocked, substitutionGroupId };
  }

  private async exigirAlimento(foodId: string): Promise<void> {
    const [f] = await this.db
      .select({ id: schema.food.id })
      .from(schema.food)
      .where(eq(schema.food.id, foodId))
      .limit(1);
    if (!f) throw new NotFoundException('alimento não encontrado');
  }

  /**
   * O alimento precisa PARTICIPAR do grupo. É o vínculo que carrega
   * `reference_portion_grams` — sem ele a conta de substituição não existe, e o
   * item viraria "flexível" dentro de um grupo que não sabe reescalá-lo.
   */
  private async exigirVinculo(foodId: string, groupId: string): Promise<void> {
    const [g] = await this.db
      .select({ id: schema.substitutionGroup.id })
      .from(schema.substitutionGroup)
      .where(eq(schema.substitutionGroup.id, groupId))
      .limit(1);
    if (!g) throw new NotFoundException('grupo de substituição não encontrado');

    const [v] = await this.db
      .select({ id: schema.foodSubstitutionGroup.id })
      .from(schema.foodSubstitutionGroup)
      .where(
        and(
          eq(schema.foodSubstitutionGroup.foodId, foodId),
          eq(schema.foodSubstitutionGroup.groupId, groupId),
        ),
      )
      .limit(1);
    if (!v) {
      throw new UnprocessableEntityException(
        'este alimento não participa deste grupo de substituição: sem a porção de referência do vínculo, a troca não tem como reescalar a quantidade. Vincule o alimento ao grupo primeiro.',
      );
    }
  }

  private async exigirPositionLivre(
    tx: Tx,
    dayTypeId: string,
    position: number,
    exceto: string | null,
  ): Promise<void> {
    const rows = await tx
      .select({ id: schema.meal.id })
      .from(schema.meal)
      .where(
        and(
          eq(schema.meal.dayTypeId, dayTypeId),
          eq(schema.meal.position, position),
        ),
      );
    if (rows.some((r) => r.id !== exceto)) {
      throw new ConflictException(
        `já existe uma refeição na posição ${position} deste tipo-de-dia. A posição é a chave que pareia as refeições entre tipos-de-dia — duplicá-la quebraria a troca de tipo-de-dia.`,
      );
    }
  }

  private async desmarcarDefaults(
    tx: Tx,
    mealId: string,
    exceto: string | null,
  ): Promise<void> {
    await tx
      .update(schema.mealOption)
      .set({ isDefault: false })
      .where(
        exceto === null
          ? eq(schema.mealOption.mealId, mealId)
          : and(
              eq(schema.mealOption.mealId, mealId),
              ne(schema.mealOption.id, exceto),
            ),
      );
  }

  /* ═══════════ resolução / 404 / releitura ═══════════ */

  private async exigirPlanoDoTipo(dayTypeId: string): Promise<string> {
    const [d] = await this.db
      .select({ planId: schema.dayType.planId })
      .from(schema.dayType)
      .where(eq(schema.dayType.id, dayTypeId))
      .limit(1);
    if (!d) throw new NotFoundException('tipo-de-dia não encontrado');
    return d.planId;
  }

  private async exigirRefeicao(
    mealId: string,
  ): Promise<{ planId: string; dayTypeId: string }> {
    const [m] = await this.db
      .select({ dayTypeId: schema.meal.dayTypeId })
      .from(schema.meal)
      .where(eq(schema.meal.id, mealId))
      .limit(1);
    if (!m) throw new NotFoundException('refeição não encontrada');
    const planId = await planIdDaRefeicao(this.db, mealId);
    if (!planId) throw new NotFoundException('refeição não encontrada');
    return { planId, dayTypeId: m.dayTypeId };
  }

  private async exigirOpcao(
    optionId: string,
  ): Promise<{ planId: string; mealId: string; isDefault: boolean }> {
    const [o] = await this.db
      .select({
        mealId: schema.mealOption.mealId,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(eq(schema.mealOption.id, optionId))
      .limit(1);
    if (!o) throw new NotFoundException('opção não encontrada');
    const planId = await planIdDaOpcao(this.db, optionId);
    if (!planId) throw new NotFoundException('opção não encontrada');
    return { planId, mealId: o.mealId, isDefault: o.isDefault };
  }

  private async exigirItem(itemId: string): Promise<{
    planId: string;
    foodId: string;
    isLocked: boolean;
    substitutionGroupId: string | null;
  }> {
    const [i] = await this.db
      .select({
        foodId: schema.mealItem.foodId,
        isLocked: schema.mealItem.isLocked,
        substitutionGroupId: schema.mealItem.substitutionGroupId,
      })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.id, itemId))
      .limit(1);
    if (!i) throw new NotFoundException('item não encontrado');
    const planId = await planIdDoItem(this.db, itemId);
    if (!planId) throw new NotFoundException('item não encontrado');
    return { planId, ...i };
  }

  private async relerRefeicao(
    planId: string,
    mealId: string,
  ): Promise<PlanoRefeicaoDto> {
    const plano = await carregarPlano(this.db, planId);
    const r = plano ? acharRefeicao(plano, mealId) : undefined;
    if (!r) throw new NotFoundException('refeição não encontrada');
    return r;
  }

  private async relerOpcao(
    planId: string,
    optionId: string,
  ): Promise<PlanoOpcaoDto> {
    const plano = await carregarPlano(this.db, planId);
    const o = plano ? acharOpcao(plano, optionId) : undefined;
    if (!o) throw new NotFoundException('opção não encontrada');
    return o;
  }

  private async relerItem(
    planId: string,
    itemId: string,
  ): Promise<PlanoItemDto> {
    const plano = await carregarPlano(this.db, planId);
    const i = plano ? acharItem(plano, itemId) : undefined;
    if (!i) throw new NotFoundException('item não encontrado');
    return i;
  }
}
