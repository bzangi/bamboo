// Loader de CASCA (Feature 012) — o ÚNICO leitor de `meal_event` no caminho de
// LEITURA. Substitui 5 implementations do mesmo conceito (`registro-consumo.ts`,
// `adesao/adesao-consumo.ts`, `ciclo.service.registrosDaJanela`,
// `relatorio.loader` e a query inline do `plan.service`), cada uma com sua
// própria ordenação, seu próprio desempate e seu próprio escopo implícito.
//
// É casca de LEITURA: I/O via Drizzle, orquestra o núcleo puro (`eventoVigente`),
// NÃO lança e não muta nada. Função livre que recebe `db` — não é `@Injectable`,
// mesmo padrão dos helpers que ela aposenta.
//
// ORDEM TOTAL EXPLÍCITA: `ORDER BY (logged_date, created_at, id)`. O `, id`
// é o que torna o empate de `created_at` determinístico — `created_at` é
// `DEFAULT now()` (= `transaction_timestamp()`, tomado ANTES do advisory lock do
// INSERT), então empates e até inversões relativas à ordem de inserção são
// possíveis. Com a ordem total, `seq = índice` é estritamente crescente e o
// desempate fica na regra do núcleo, não na sorte do heap.
//
// ESCOPO DE PLANO OBRIGATÓRIO (D2): não há default. Os consumidores divergem por
// DECISÃO, não por descuido — a adesão é plan-scoped (só o plano vigente conta
// para a régua corrente), o ciclo e o relatório são plan-agnostic (a nutri quer
// ver tudo que o paciente registrou na janela, inclusive sob um plano já
// aposentado). Tornar o parâmetro obrigatório força cada call site a declarar
// qual dos dois quer, e o `tsc` cobra a declaração.
import { eventoVigente, type EstadoRegistro } from '@bamboo/core';
import { and, asc, eq, gte, lte, schema } from '@bamboo/db';
import type { Db } from './db/db.module';

export type EscopoPlano =
  | { readonly kind: 'plano'; readonly planId: string }
  | { readonly kind: 'qualquer-plano' };

export interface RegistroVigente {
  readonly eventoId: string;
  readonly date: string; // logged_date (YYYY-MM-DD)
  readonly mealId: string;
  readonly position: number; // meal.position DO EVENTO (não do tipo-de-dia alvo)
  readonly nome: string; // meal.name DO EVENTO — ver aviso abaixo
  readonly dayTypeId: string; // snapshot do tipo em vigor no registro (003/FR-014)
  readonly planId: string;
  readonly state: EstadoRegistro; // nunca null — tombstone já descartado
  readonly chosenMealOptionId: string | null;
}

/**
 * Registro vigente de cada `(dia, refeição)` do paciente na janela `[from..to]`.
 * `from === to` ⇒ janela de um dia. Anulados (tombstone) não aparecem.
 *
 * ORDEM DE SAÍDA: primeira aparição de cada `(date, mealId)` na query ordenada —
 * exatamente o que o agrupamento por `Map` produz hoje nos 5 leitores. NÃO é a
 * ordem do `created_at` do evento VENCEDOR: trocar isso mudaria quem ganha uma
 * colisão de `position` no relatório (`relatorio.loader.ts`, `new Map(...)` com
 * último-ganha) e a ordem do array de `registros` do ciclo, pinada em
 * `ciclo.e2e-spec.ts:487-506`. NUNCA ordenar por `position` (ADR-0001).
 *
 * `nome` NÃO TEM CONSUMIDOR hoje: o relatório pega o nome das refeições do tipo
 * ALVO, não do evento. O campo existe porque o join já o traz — não trocar a
 * fonte do nome do roster por ele, mudaria as refeições esperadas.
 */
export async function carregarRegistroVigente(
  db: Db,
  args: {
    readonly patientId: string;
    readonly from: string; // YYYY-MM-DD (inclusive)
    readonly to: string; // YYYY-MM-DD (inclusive)
    readonly escopo: EscopoPlano;
  },
): Promise<ReadonlyArray<RegistroVigente>> {
  const { patientId, from, to, escopo } = args;

  const eventos = await db
    .select({
      eventoId: schema.mealEvent.id,
      date: schema.mealEvent.loggedDate,
      mealId: schema.mealEvent.mealId,
      position: schema.meal.position,
      nome: schema.meal.name,
      dayTypeId: schema.mealEvent.dayTypeId,
      planId: schema.mealEvent.planId,
      state: schema.mealEvent.state,
      chosenMealOptionId: schema.mealEvent.chosenMealOptionId,
    })
    .from(schema.mealEvent)
    .innerJoin(schema.meal, eq(schema.mealEvent.mealId, schema.meal.id))
    .where(
      and(
        eq(schema.mealEvent.patientId, patientId),
        gte(schema.mealEvent.loggedDate, from),
        lte(schema.mealEvent.loggedDate, to),
        ...(escopo.kind === 'plano'
          ? [eq(schema.mealEvent.planId, escopo.planId)]
          : []),
      ),
    )
    .orderBy(
      asc(schema.mealEvent.loggedDate),
      asc(schema.mealEvent.createdAt),
      asc(schema.mealEvent.id),
    );

  // Agrupa por (dia, refeição) preservando a ordem de primeira aparição.
  // `seq` = índice na lista do grupo: a query já é totalmente ordenada, então o
  // índice é a ordem total estritamente crescente que `eventoVigente` exige.
  type Bruto = (typeof eventos)[number];
  const porDiaMeal = new Map<string, { seq: number; evento: Bruto }[]>();
  for (const e of eventos) {
    const key = `${e.date}|${e.mealId}`;
    const lista = porDiaMeal.get(key) ?? [];
    lista.push({ seq: lista.length, evento: e });
    porDiaMeal.set(key, lista);
  }

  const vigentes: RegistroVigente[] = [];
  for (const lista of porDiaMeal.values()) {
    // O retorno narrowed do núcleo garante `state: EstadoRegistro` sem cast —
    // descartar por `=== null`, NUNCA por `as`: o cast apagaria o descarte do
    // tombstone e faria refeições desfeitas reaparecerem nos 5 consumidores.
    const vencedor = eventoVigente(
      lista.map((l) => ({
        seq: l.seq,
        state: l.evento.state,
        evento: l.evento,
      })),
    );
    if (vencedor === null) continue;
    const { evento } = vencedor;
    vigentes.push({
      eventoId: evento.eventoId,
      date: evento.date,
      mealId: evento.mealId,
      position: evento.position,
      nome: evento.nome,
      dayTypeId: evento.dayTypeId,
      planId: evento.planId,
      state: vencedor.state,
      chosenMealOptionId: evento.chosenMealOptionId,
    });
  }
  return vigentes;
}
