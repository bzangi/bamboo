"use server";

// Toda ESCRITA da visão da nutri (017). Server Actions: rodam no servidor, então a
// credencial continua onde estava (FR-010) e nenhuma tela precisa ser componente
// client.
//
// ⚠️ `redirect()` funciona LANÇANDO uma exceção interna do Next — por isso ele
// nunca pode ficar dentro do `try`, ou o `catch` engole o redirect e a resposta
// vira erro. Foi assim que a 016 aprendeu.
//
// O destino do redirect é DERIVADO dos ids que a ação já recebe, nunca um campo
// `_volta` no formulário: um campo de destino no HTML é uma superfície de
// open-redirect de graça, e aqui não há nenhuma pergunta que ele responda.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { codigo, type CodigoDeFalha, type Entidade } from "../lib/erros";
import {
  activatePlan,
  createDayType,
  createItem,
  createMeal,
  createOption,
  createPatient,
  createPlan,
  deleteDayType,
  deleteItem,
  deleteMeal,
  deleteOption,
  deletePatient,
  deletePlan,
  setSchedule,
  statusDaFalha,
  updateDayType,
  updateItem,
  updateMeal,
  updateOption,
  updatePatient,
  updatePlan,
} from "../lib/nutri";

const NOME_MAX = 120;

const txt = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string): number => Number(txt(fd, k));

/** Campo de texto opcional: em branco no formulário significa LIMPAR (null). */
const opcional = (fd: FormData, k: string): string | null => {
  const v = txt(fd, k);
  return v.length === 0 ? null : v;
};

/** Campo numérico opcional: em branco significa LIMPAR (null). */
const numOpcional = (fd: FormData, k: string): number | null => {
  const v = txt(fd, k);
  return v.length === 0 ? null : Number(v);
};

/**
 * Roda a escrita, revalida e volta. Devolve `never`: sempre redireciona.
 * O código de falha sai de (status, entidade) — ver `lib/erros.ts`.
 */
async function executar(
  entidade: Entidade,
  volta: string,
  extra: Record<string, string>,
  op: () => Promise<unknown>,
): Promise<never> {
  let cod: CodigoDeFalha | null = null;
  try {
    await op();
  } catch (e) {
    cod = codigo(statusDaFalha(e), entidade);
  }

  revalidatePath(volta);
  const qs = new URLSearchParams(extra);
  if (cod) qs.set("erro", cod);
  const query = qs.toString();
  // Sempre redireciona, mesmo no sucesso: limpa um `?erro=` antigo da barra.
  redirect(query.length > 0 ? `${volta}?${query}` : volta);
}

/** A tela do editor mostra um tipo-de-dia por vez, então o retorno o preserva. */
const doEditor = (dayTypeId: string): Record<string, string> =>
  dayTypeId.length > 0 ? { dayType: dayTypeId } : {};

/* ═══════════ paciente ═══════════ */

export async function cadastrarPaciente(fd: FormData): Promise<void> {
  const name = txt(fd, "name");
  if (name.length === 0 || name.length > NOME_MAX) {
    redirect("/?erro=nome-invalido");
  }
  await executar("paciente", "/", {}, () => createPatient(name));
}

export async function editarPaciente(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  // Patch com TODAS as chaves presentes: a API distingue chave ausente (preserva)
  // de `null` (limpa), e este formulário mostra a ficha inteira — então o que
  // ficou em branco é uma intenção de limpar, não de preservar.
  const patch = {
    name: txt(fd, "name"),
    email: opcional(fd, "email"),
    phone: opcional(fd, "phone"),
    heightCm: numOpcional(fd, "heightCm"),
    weightKg: numOpcional(fd, "weightKg"),
    exposure: txt(fd, "exposure"),
  };
  await executar("paciente", `/patients/${patientId}`, {}, () =>
    updatePatient(patientId, patch),
  );
}

export async function excluirPaciente(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  // Volta para a roster: o paciente não existe mais, a tela dele também não.
  await executar("paciente", "/", {}, () => deletePatient(patientId));
}

/* ═══════════ plano ═══════════ */

const rotaPlanos = (patientId: string) => `/patients/${patientId}/plans`;

export async function criarPlano(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  await executar("plano", rotaPlanos(patientId), {}, () =>
    createPlan(patientId, txt(fd, "name")),
  );
}

export async function renomearPlano(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  await executar("plano", rotaPlanos(patientId), {}, () =>
    updatePlan(txt(fd, "planId"), txt(fd, "name")),
  );
}

export async function excluirPlano(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  await executar("plano", rotaPlanos(patientId), {}, () =>
    deletePlan(txt(fd, "planId")),
  );
}

export async function ativarPlano(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  await executar("plano", rotaPlanos(patientId), {}, () =>
    activatePlan(patientId, txt(fd, "planId")),
  );
}

/* ═══════════ o editor ═══════════ */

const rotaEditor = (patientId: string, planId: string) =>
  `/patients/${patientId}/plans/${planId}`;

/** Contexto que todo formulário do editor carrega em campos ocultos. */
function contexto(fd: FormData): {
  volta: string;
  extra: Record<string, string>;
} {
  const patientId = txt(fd, "patientId");
  const planId = txt(fd, "planId");
  return {
    volta: rotaEditor(patientId, planId),
    extra: doEditor(txt(fd, "dayTypeId")),
  };
}

export async function criarTipoDia(fd: FormData): Promise<void> {
  const { volta } = contexto(fd);
  await executar("tipo-de-dia", volta, {}, () =>
    createDayType(txt(fd, "planId"), txt(fd, "name")),
  );
}

export async function renomearTipoDia(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("tipo-de-dia", volta, extra, () =>
    updateDayType(txt(fd, "dayTypeId"), txt(fd, "name")),
  );
}

export async function excluirTipoDia(fd: FormData): Promise<void> {
  const { volta } = contexto(fd);
  // Sem `extra`: o tipo-de-dia que a tela estava mostrando é o que acabou de sair.
  await executar("tipo-de-dia", volta, {}, () =>
    deleteDayType(txt(fd, "dayTypeId")),
  );
}

export async function salvarSemana(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    dayTypeId: txt(fd, `d${weekday}`),
  }));
  await executar("semana", volta, extra, () =>
    setSchedule(txt(fd, "planId"), days),
  );
}

export async function criarRefeicao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("refeicao-posicao", volta, extra, () =>
    createMeal(txt(fd, "dayTypeId"), {
      name: txt(fd, "name"),
      position: num(fd, "position"),
      horario: opcional(fd, "horario"),
    }),
  );
}

export async function editarRefeicao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("refeicao-posicao", volta, extra, () =>
    updateMeal(txt(fd, "mealId"), {
      name: txt(fd, "name"),
      position: num(fd, "position"),
      horario: opcional(fd, "horario"),
    }),
  );
}

export async function excluirRefeicao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("refeicao", volta, extra, () => deleteMeal(txt(fd, "mealId")));
}

export async function criarOpcao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("opcao", volta, extra, () =>
    createOption(txt(fd, "mealId"), { label: txt(fd, "label") }),
  );
}

export async function editarOpcao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("opcao", volta, extra, () =>
    updateOption(txt(fd, "optionId"), { label: txt(fd, "label") }),
  );
}

export async function tornarPadrao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("opcao", volta, extra, () =>
    updateOption(txt(fd, "optionId"), { isDefault: true }),
  );
}

export async function excluirOpcao(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("opcao", volta, extra, () =>
    deleteOption(txt(fd, "optionId")),
  );
}

/**
 * A marcação de flexibilidade é UM controle com três formas, não dois campos que
 * podem se contradizer: vazio = flexível sem grupo, `travado`, ou o id de um
 * grupo. A API recusa travado+grupo com 400 — aqui a combinação é inexpressável.
 */
function flexibilidade(fd: FormData): {
  isLocked: boolean;
  substitutionGroupId: string | null;
} {
  const flex = txt(fd, "flex");
  if (flex === "travado") return { isLocked: true, substitutionGroupId: null };
  return {
    isLocked: false,
    substitutionGroupId: flex.length > 0 ? flex : null,
  };
}

export async function criarItem(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("item", volta, extra, () =>
    createItem(txt(fd, "optionId"), {
      foodId: txt(fd, "foodId"),
      quantityGrams: num(fd, "quantityGrams"),
      ...flexibilidade(fd),
    }),
  );
}

export async function editarItem(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("item", volta, extra, () =>
    updateItem(txt(fd, "itemId"), {
      foodId: txt(fd, "foodId"),
      quantityGrams: num(fd, "quantityGrams"),
      ...flexibilidade(fd),
    }),
  );
}

export async function excluirItem(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  await executar("item", volta, extra, () => deleteItem(txt(fd, "itemId")));
}
