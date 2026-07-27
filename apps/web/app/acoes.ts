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
  assinaturaItem,
  assinaturaRefeicao,
  assinaturaSemana,
  idsDe,
} from "../lib/lote";
import {
  activatePlan,
  closeCycle,
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
  openCycle,
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

/** Uma escrita e a entidade que ela toca — é a entidade que escolhe a frase. */
type Passo = {
  readonly entidade: Entidade;
  readonly op: () => Promise<unknown>;
};

/**
 * Roda as escritas EM ORDEM, para na primeira falha, revalida e volta. Devolve
 * `never`: sempre redireciona.
 *
 * Para na primeira falha de propósito: o formulário do editor é um lote, e
 * seguir depois de um 409 deixaria a nutri com metade aplicada e uma frase só.
 * ponytail: não é transação — o que passou antes do erro fica gravado. Se isso
 * doer, o lugar de consertar é um endpoint de lote na API, não aqui.
 */
async function executarPassos(
  volta: string,
  extra: Record<string, string>,
  passos: ReadonlyArray<Passo>,
  /** Para onde voltar quando algo falhou (o editor fica no modo de edição). */
  extraNaFalha: Record<string, string> = extra,
): Promise<never> {
  let cod: CodigoDeFalha | null = null;
  for (const passo of passos) {
    try {
      await passo.op();
    } catch (e) {
      cod = codigo(statusDaFalha(e), passo.entidade);
      break;
    }
  }

  revalidatePath(volta);
  const qs = new URLSearchParams(cod ? extraNaFalha : extra);
  if (cod) qs.set("erro", cod);
  const query = qs.toString();
  // Sempre redireciona, mesmo no sucesso: limpa um `?erro=` antigo da barra.
  redirect(query.length > 0 ? `${volta}?${query}` : volta);
}

/** O caso de um passo só — a forma de toda escrita fora do editor. */
const executar = (
  entidade: Entidade,
  volta: string,
  extra: Record<string, string>,
  op: () => Promise<unknown>,
): Promise<never> => executarPassos(volta, extra, [{ entidade, op }]);

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

/* ═══════════ ciclo de acompanhamento ═══════════
 *
 * Os dois ATOS da consulta. Voltam para a tela de acompanhamento porque é ela
 * que muda: abrir troca o estado vazio pelo relatório, fechar congela a janela. */

export async function abrirCiclo(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  const dias = num(fd, "expectedDurationDays");
  // Barrado na borda antes de gastar uma ida à API: a duração é obrigatória e é
  // contagem de dias, então fracionário e não-positivo não são um ciclo.
  if (!Number.isInteger(dias) || dias <= 0) {
    redirect(`/patients/${patientId}?erro=duracao-invalida`);
  }
  await executar("ciclo", `/patients/${patientId}`, {}, () =>
    openCycle(patientId, dias),
  );
}

export async function fecharCiclo(fd: FormData): Promise<void> {
  const patientId = txt(fd, "patientId");
  await executar("ciclo", `/patients/${patientId}`, {}, () =>
    closeCycle(patientId),
  );
}

/* ═══════════ o editor ═══════════ */

const rotaEditor = (patientId: string, planId: string) =>
  `/patients/${patientId}/plans/${planId}`;

/** Contexto que todo formulário do editor carrega em campos ocultos: a tela
 *  mostra UM tipo-de-dia por vez, então o retorno o preserva. */
function contexto(fd: FormData): {
  volta: string;
  extra: Record<string, string>;
} {
  const patientId = txt(fd, "patientId");
  const planId = txt(fd, "planId");
  const dayTypeId = txt(fd, "dayTypeId");
  return {
    volta: rotaEditor(patientId, planId),
    extra: dayTypeId.length > 0 ? { dayType: dayTypeId } : {},
  };
}

/** O modo de edição é um parâmetro da URL — a tela não tem estado no navegador. */
const emEdicao = (extra: Record<string, string>): Record<string, string> => ({
  ...extra,
  edit: "1",
});

const ids = (fd: FormData, prefixo: string, sufixo: string): string[] =>
  idsDe(fd.keys(), prefixo, sufixo);

/**
 * A marcação de flexibilidade é UM controle com três formas, não dois campos que
 * podem se contradizer: vazio = flexível sem grupo, `travado`, ou o id de um
 * grupo. A API recusa travado+grupo com 400 — aqui a combinação é inexpressável.
 */
function flexibilidade(
  fd: FormData,
  chave: string,
): { isLocked: boolean; substitutionGroupId: string | null } {
  const flex = txt(fd, chave);
  if (flex === "travado") return { isLocked: true, substitutionGroupId: null };
  return {
    isLocked: false,
    substitutionGroupId: flex.length > 0 ? flex : null,
  };
}

/**
 * O corpo de um item: alimento + quantidade + flexibilidade.
 *
 * "À vontade" (018) e gramas são UM controle, não dois: marcado, a quantidade é
 * 0 por definição e o que estiver digitado no campo é ignorado — sem isso o
 * mesmo item teria duas verdades sobre quanto se come dele. A API aplica a mesma
 * regra, então nem um cliente que mande os dois consegue produzir o estado
 * híbrido.
 */
function quantidade(
  fd: FormData,
  prefixo: string,
): {
  foodId: string;
  quantityGrams: number;
  adLibitum: boolean;
  isLocked: boolean;
  substitutionGroupId: string | null;
} {
  const adLibitum = txt(fd, `${prefixo}.aVontade`) === "1";
  return {
    foodId: txt(fd, `${prefixo}.foodId`),
    quantityGrams: adLibitum ? 0 : num(fd, `${prefixo}.quantityGrams`),
    adLibitum,
    ...flexibilidade(fd, `${prefixo}.flex`),
  };
}

/**
 * Os índices presentes para um par (prefixo, campo), em ORDEM numérica:
 * `novo-tipo.0.name`, `novo-tipo.1.name` → `[0, 1]`. A ordem é a da tela — a
 * nutri escreveu de cima para baixo e é assim que os nós devem nascer.
 */
function indices(fd: FormData, prefixo: string, campo: string): number[] {
  return idsDe(fd.keys(), `${prefixo}.`, `.${campo}`)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
}

/**
 * As linhas de item preenchidas, agrupadas pelo PAI.
 *
 * `novo-item.<optionId>.<i>.foodId` → chave `<optionId>`;
 * `nova-op.<mealId>.item.<i>.foodId` (prefixo já completo) → chave `""`, porque
 * ali o pai ainda não existe: ele nasce no mesmo salvar.
 */
function linhasDeItem(
  fd: FormData,
  prefixo: string,
): Map<string, ReturnType<typeof quantidade>[]> {
  const fora = new Map<string, ReturnType<typeof quantidade>[]>();
  for (const chave of idsDe(fd.keys(), `${prefixo}.`, ".foodId")) {
    const corte = chave.lastIndexOf(".");
    const pai = corte === -1 ? "" : chave.slice(0, corte);
    const body = quantidade(fd, `${prefixo}.${chave}`);
    if (body.foodId.length === 0) continue;
    const atual = fora.get(pai);
    if (atual) atual.push(body);
    else fora.set(pai, [body]);
  }
  return fora;
}

/** As refeições novas preenchidas, em ordem de tela. */
function lerNovasRefeicoes(fd: FormData): {
  name: string;
  position: number;
  horario: string | null;
}[] {
  return indices(fd, "nova-refeicao", "name")
    .map((i) => ({
      name: txt(fd, `nova-refeicao.${i}.name`),
      position: num(fd, `nova-refeicao.${i}.position`),
      horario: opcional(fd, `nova-refeicao.${i}.horario`),
    }))
    .filter((r) => r.name.length > 0);
}

/** Os nós que a marcação de exclusão sabe apagar. */
const APAGAR: Record<
  string,
  { entidade: Entidade; fn: (id: string) => Promise<void> }
> = {
  item: { entidade: "item", fn: deleteItem },
  opcao: { entidade: "opcao", fn: deleteOption },
  refeicao: { entidade: "refeicao", fn: deleteMeal },
  "tipo-de-dia": { entidade: "tipo-de-dia", fn: deleteDayType },
};

/**
 * O SALVAR ÚNICO do editor: o formulário inteiro do modo de edição vira um lote
 * de escritas.
 *
 * Só o que MUDOU vira requisição — cada campo editável tem um `orig.<chave>`
 * oculto com o valor que veio do banco, e a comparação é de assinatura. Sem isso
 * um salvar num tipo-de-dia de 4 refeições dispararia ~30 PATCHes idênticos.
 *
 * Edições ANTES das criações: o nó novo nasce já no plano final, e uma refeição
 * criada na posição que outra acabou de liberar não colide.
 *
 * A exclusão também é PENDENTE: a lixeirinha é um checkbox, não um botão que
 * apaga na hora. Isso é o que faz "refeição removida" aparecer na revisão junto
 * com o resto — e o que mantém a promessa de que nada muda até o salvar.
 *
 * ponytail: mover duas refeições trocando as posições entre si ainda pode dar
 * 409 (a primeira bate na segunda, que ainda não saiu). Se aparecer na prática,
 * o conserto é liberar as posições num passo intermediário — não relaxar a
 * unicidade, que é o que faz a troca de tipo-de-dia parear.
 */
export async function salvarTudo(fd: FormData): Promise<void> {
  const { volta, extra } = contexto(fd);
  const planId = txt(fd, "planId");
  const dayTypeId = txt(fd, "dayTypeId");
  const passos: Passo[] = [];
  /** Criou nó novo? É o que decide se o salvar volta para a edição. */
  let criou = false;
  const mudou = (chave: string, valor: string) =>
    txt(fd, `orig.${chave}`) !== valor;

  for (const id of ids(fd, "dt.", ".name")) {
    const name = txt(fd, `dt.${id}.name`);
    if (mudou(`dt.${id}`, name))
      passos.push({
        entidade: "tipo-de-dia",
        op: () => updateDayType(id, name),
      });
  }

  // A semana é UM objeto (017/D2): sete dias que só fazem sentido juntos.
  if (fd.has("d0")) {
    const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      dayTypeId: txt(fd, `d${weekday}`),
    }));
    const assinatura = assinaturaSemana(days.map((d) => d.dayTypeId));
    if (mudou("semana", assinatura))
      passos.push({
        entidade: "semana",
        op: () => setSchedule(planId, days),
      });
  }

  for (const id of ids(fd, "meal.", ".name")) {
    const patch = {
      name: txt(fd, `meal.${id}.name`),
      position: num(fd, `meal.${id}.position`),
      horario: opcional(fd, `meal.${id}.horario`),
    };
    if (
      mudou(
        `meal.${id}`,
        assinaturaRefeicao(patch.name, patch.position, patch.horario),
      )
    )
      passos.push({
        entidade: "refeicao-posicao",
        op: () => updateMeal(id, patch),
      });
  }

  for (const id of ids(fd, "op.", ".label")) {
    const label = txt(fd, `op.${id}.label`);
    if (mudou(`op.${id}`, label))
      passos.push({ entidade: "opcao", op: () => updateOption(id, { label }) });
  }

  // Exatamente uma padrão por refeição: no HTML isso é um grupo de rádio, então
  // a combinação "duas padrão" nem chega a ser expressável.
  for (const mealId of ids(fd, "padrao.", "")) {
    const escolhida = txt(fd, `padrao.${mealId}`);
    if (escolhida.length > 0 && mudou(`padrao.${mealId}`, escolhida))
      passos.push({
        entidade: "opcao",
        op: () => updateOption(escolhida, { isDefault: true }),
      });
  }

  for (const id of ids(fd, "item.", ".foodId")) {
    const patch = quantidade(fd, `item.${id}`);
    const assinatura = assinaturaItem(
      patch.foodId,
      patch.quantityGrams,
      patch.adLibitum,
      txt(fd, `item.${id}.flex`),
    );
    if (mudou(`item.${id}`, assinatura))
      passos.push({ entidade: "item", op: () => updateItem(id, patch) });
  }

  // ─── criações: as linhas em branco no fim de cada lista, indexadas porque o
  // "+" da tela clona a linha (`repetir.tsx`). Linha vazia = nada a criar, e é
  // por isso que esses campos não são `required`: um `required` numa linha que
  // ninguém preencheu barraria o salvar do formulário inteiro.
  for (const [optionId, itens] of linhasDeItem(fd, "novo-item")) {
    for (const body of itens) {
      criou = true;
      passos.push({ entidade: "item", op: () => createItem(optionId, body) });
    }
  }

  for (const chave of ids(fd, "nova-op.", ".label")) {
    // `chave` é `<mealId>.<i>`: a linha de opção também repete na tela.
    const corte = chave.lastIndexOf(".");
    if (corte === -1) continue;
    const mealId = chave.slice(0, corte);
    const label = txt(fd, `nova-op.${chave}.label`);
    if (label.length === 0) continue;
    criou = true;
    // A opção nova e os alimentos dela nascem no MESMO passo: os itens dependem
    // do id que só existe depois do POST da opção, e mandar a nutri salvar duas
    // vezes para pôr comida numa opção que ela acabou de criar é o atrito que
    // esta tela existe para não ter.
    const itens = linhasDeItem(fd, `nova-op.${chave}.item`).get("") ?? [];
    passos.push({
      entidade: "opcao",
      op: async () => {
        const nova = await createOption(mealId, { label });
        for (const body of itens) await createItem(nova.id, body);
      },
    });
  }

  if (dayTypeId.length > 0) {
    for (const body of lerNovasRefeicoes(fd)) {
      criou = true;
      passos.push({
        entidade: "refeicao-posicao",
        // Refeição sem opção não tem NADA: o app do paciente não mostra a
        // refeição, e a tela da nutri não tem onde pôr alimento. A primeira
        // nasce junto, e a API já a marca como padrão sem pedir (017/FR-011).
        op: async () => {
          const nova = await createMeal(dayTypeId, body);
          await createOption(nova.id, { label: "Padrão" });
        },
      });
    }
  }

  for (const i of indices(fd, "novo-tipo", "name")) {
    const nome = txt(fd, `novo-tipo.${i}.name`);
    if (nome.length === 0) continue;
    criou = true;
    passos.push({
      entidade: "tipo-de-dia",
      op: () => createDayType(planId, nome),
    });
  }

  // ─── remoções POR ÚLTIMO, e é por isso que edição em nó marcado para sair
  // não é erro: o nó ainda existe quando o PATCH passa. Gasta uma requisição à
  // toa numa combinação rara (editar e excluir a mesma coisa no mesmo salvar) e
  // em troca não precisa saber quem é filho de quem para pular.
  for (const marca of fd.getAll("remover")) {
    const [tipo = "", alvoId = ""] = String(marca).split(":");
    const alvo = Object.hasOwn(APAGAR, tipo) ? APAGAR[tipo] : undefined;
    if (!alvo || alvoId.length === 0) continue;
    passos.push({ entidade: alvo.entidade, op: () => alvo.fn(alvoId) });
  }

  // Deu certo E criou algo: fica em edição, porque o nó novo (a refeição, a
  // opção) acabou de ganhar os campos que ainda precisam ser preenchidos —
  // mandar para a leitura obrigaria a clicar em Editar de novo para continuar.
  // Só edição: volta para a leitura. Falhou: fica em edição, com o aviso.
  const destino = criou ? emEdicao(extra) : extra;
  await executarPassos(volta, destino, passos, emEdicao(extra));
}
