// Acesso à via /nutri da API. **Só roda no servidor** (Server Components e Server
// Actions): a credencial da nutri nunca pode chegar ao navegador (FR-006).
//
// A garantia não é um comentário: a chave é lida de `process.env.NUTRI_API_KEY`
// — sem prefixo `NEXT_PUBLIC_`, ela simplesmente não existe no bundle do
// browser. O editor de plano tem TRÊS ilhas client — `revisao.tsx` (o modal de
// revisão antes de salvar), `novos.tsx` (as linhas que ainda não existem no
// banco) e `seletor.tsx` (a busca de alimento). Nenhuma importa este arquivo e
// nenhuma recebe segredo por prop. O seletor CONSULTA o catálogo, mas por uma
// Server Action (`app/busca.ts`): a chave fica no servidor e o que atravessa
// para o cliente é a resposta já filtrada. Se um dia alguém importar isto de
// um componente client, `process.env` vem vazio e o fetch falha fechado, com a
// mensagem de configuração abaixo. Fail-closed como o guard do lado da API.
//
// Como CONFERIR (a 017 aprendeu isto na mão): procure a DIRETIVA, não a
// substring — vários arquivos citam a expressão em comentário, então um
// `grep -rl "use client"` devolve falsos positivos. O teste certo é
//     grep -rlE '^\s*["'"'"']use client["'"'"']' apps/web/{app,components,lib}
// e a resposta esperada são TRÊS arquivos, todos em `plans/[planId]/`:
// `revisao.tsx`, `novos.tsx` e `seletor.tsx`. Um quarto é regressão — vale a
// mesma pergunta de sempre: essa tela precisa mesmo de JavaScript?
//
// Reusa o `requestJson`/`requestVoid` do @bamboo/api-client (D6): eles separam
// "não conectou" de "a API respondeu erro", que é exatamente a distinção que a
// tela precisa dizer.
import { ApiError, requestJson, requestVoid } from "@bamboo/api-client";
import type {
  CycleReportResponse,
  FoodsResponse,
  GruposResponse,
  NutriPatientDetalheDto,
  NutriPatientDto,
  NutriPatientsResponse,
  PlanoDto,
  PlanoItemDto,
  PlanoOpcaoDto,
  PlanoRefeicaoDto,
  PlanoTipoDiaDto,
  PlanosResponse,
} from "@bamboo/types";

export const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** Erro de CONFIGURAÇÃO (não de rede, não da API): a env não está no lugar. */
export class ConfigError extends Error {}

function nutriHeaders(): Record<string, string> {
  const key = process.env.NUTRI_API_KEY;
  if (!key) {
    throw new ConfigError(
      "NUTRI_API_KEY não está definida no ambiente do servidor web. " +
        "Copie o .env.example para .env na raiz do monorepo (a mesma chave que a API usa) e reinicie o `next dev`.",
    );
  }
  return { "x-nutri-key": key };
}

const get = <T>(path: string, label: string): Promise<T> =>
  requestJson<T>(`${API_URL}${path}`, {
    label,
    headers: nutriHeaders(),
    // A nutri está lendo/editando acompanhamento: nada de resposta cacheada.
    cache: "no-store",
  });

const escrever = <T>(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  label: string,
  body: unknown,
): Promise<T> =>
  requestJson<T>(`${API_URL}${path}`, {
    label,
    method,
    headers: { ...nutriHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

/** DELETE responde 204 sem corpo — daí `requestVoid` e não `requestJson`. */
const apagar = (path: string, label: string): Promise<void> =>
  requestVoid(`${API_URL}${path}`, {
    label,
    method: "DELETE",
    headers: nutriHeaders(),
    cache: "no-store",
  });

const id = (v: string) => encodeURIComponent(v);

/* ═══════════ paciente ═══════════ */

/** A roster. Também é a fonte de nome + ciclo atual da tela do paciente (D1). */
export const listPatients = (): Promise<NutriPatientsResponse> =>
  get<NutriPatientsResponse>("/nutri/patients", "listPatients");

/** Cadastro de paciente (016). Devolve o paciente já na forma do item da lista. */
export const createPatient = (name: string): Promise<NutriPatientDto> =>
  escrever<NutriPatientDto>("POST", "/nutri/patients", "createPatient", {
    name,
  });

/** A ficha, para o formulário de edição preencher (017). */
export const getPatient = (
  patientId: string,
): Promise<NutriPatientDetalheDto> =>
  get<NutriPatientDetalheDto>(`/nutri/patients/${id(patientId)}`, "getPatient");

export const updatePatient = (
  patientId: string,
  patch: Record<string, unknown>,
): Promise<NutriPatientDetalheDto> =>
  escrever<NutriPatientDetalheDto>(
    "PATCH",
    `/nutri/patients/${id(patientId)}`,
    "updatePatient",
    patch,
  );

export const deletePatient = (patientId: string): Promise<void> =>
  apagar(`/nutri/patients/${id(patientId)}`, "deletePatient");

/* ═══════════ plano ═══════════ */

export const listPlans = (patientId: string): Promise<PlanosResponse> =>
  get<PlanosResponse>(`/nutri/patients/${id(patientId)}/plans`, "listPlans");

export const createPlan = (
  patientId: string,
  name: string,
): Promise<PlanoDto> =>
  escrever<PlanoDto>(
    "POST",
    `/nutri/patients/${id(patientId)}/plans`,
    "createPlan",
    { name },
  );

export const getPlan = (planId: string): Promise<PlanoDto> =>
  get<PlanoDto>(`/nutri/plans/${id(planId)}`, "getPlan");

export const updatePlan = (planId: string, name: string): Promise<PlanoDto> =>
  escrever<PlanoDto>("PATCH", `/nutri/plans/${id(planId)}`, "updatePlan", {
    name,
  });

export const deletePlan = (planId: string): Promise<void> =>
  apagar(`/nutri/plans/${id(planId)}`, "deletePlan");

/* ═══════════ ciclo de acompanhamento (007) ═══════════
 *
 * Abrir e fechar são ATOS da consulta, não edição de cadastro — por isso são
 * `POST` sem corpo de recurso, e não PATCH.
 *
 * `closeCycle` é por PACIENTE, sem `cycleId`: o banco garante no máximo um ciclo
 * aberto por paciente (índice único parcial `cycle_one_active_per_patient`), então
 * "qual fechar" não é uma pergunta que a tela possa errar. */

export const openCycle = (
  patientId: string,
  expectedDurationDays: number,
): Promise<unknown> =>
  escrever("POST", `/nutri/patients/${id(patientId)}/cycles`, "openCycle", {
    expectedDurationDays,
  });

/** Sem ciclo aberto a API responde no-op orientado, nunca erro destrutivo.
 *  Corpo vazio porque o ato não tem parâmetro — o `{}` é só para o `content-type`
 *  bater com o que o Nest espera. */
export const closeCycle = (patientId: string): Promise<unknown> =>
  escrever(
    "POST",
    `/nutri/patients/${id(patientId)}/cycles/close`,
    "closeCycle",
    {},
  );

/** Ativar plano continua sendo o ato observado pelo ciclo (007) — não é PATCH. */
export const activatePlan = (
  patientId: string,
  planId: string,
): Promise<{ planId: string; jaAtivo: boolean }> =>
  escrever(
    "POST",
    `/nutri/patients/${id(patientId)}/active-plan`,
    "activatePlan",
    { planId },
  );

export const setSchedule = (
  planId: string,
  days: ReadonlyArray<{ weekday: number; dayTypeId: string }>,
): Promise<PlanoDto> =>
  escrever<PlanoDto>(
    "PUT",
    `/nutri/plans/${id(planId)}/schedule`,
    "setSchedule",
    { days },
  );

/* ═══════════ tipo-de-dia ═══════════ */

export const createDayType = (
  planId: string,
  name: string,
): Promise<PlanoTipoDiaDto> =>
  escrever<PlanoTipoDiaDto>(
    "POST",
    `/nutri/plans/${id(planId)}/day-types`,
    "createDayType",
    { name },
  );

export const updateDayType = (
  dayTypeId: string,
  name: string,
): Promise<PlanoTipoDiaDto> =>
  escrever<PlanoTipoDiaDto>(
    "PATCH",
    `/nutri/day-types/${id(dayTypeId)}`,
    "updateDayType",
    { name },
  );

export const deleteDayType = (dayTypeId: string): Promise<void> =>
  apagar(`/nutri/day-types/${id(dayTypeId)}`, "deleteDayType");

/* ═══════════ refeição · opção · item ═══════════ */

export const createMeal = (
  dayTypeId: string,
  body: { name: string; position: number; horario?: string | null },
): Promise<PlanoRefeicaoDto> =>
  escrever<PlanoRefeicaoDto>(
    "POST",
    `/nutri/day-types/${id(dayTypeId)}/meals`,
    "createMeal",
    body,
  );

export const updateMeal = (
  mealId: string,
  patch: Record<string, unknown>,
): Promise<PlanoRefeicaoDto> =>
  escrever<PlanoRefeicaoDto>(
    "PATCH",
    `/nutri/meals/${id(mealId)}`,
    "updateMeal",
    patch,
  );

export const deleteMeal = (mealId: string): Promise<void> =>
  apagar(`/nutri/meals/${id(mealId)}`, "deleteMeal");

export const createOption = (
  mealId: string,
  body: { label: string; isDefault?: boolean },
): Promise<PlanoOpcaoDto> =>
  escrever<PlanoOpcaoDto>(
    "POST",
    `/nutri/meals/${id(mealId)}/options`,
    "createOption",
    body,
  );

export const updateOption = (
  optionId: string,
  patch: Record<string, unknown>,
): Promise<PlanoOpcaoDto> =>
  escrever<PlanoOpcaoDto>(
    "PATCH",
    `/nutri/options/${id(optionId)}`,
    "updateOption",
    patch,
  );

export const deleteOption = (optionId: string): Promise<void> =>
  apagar(`/nutri/options/${id(optionId)}`, "deleteOption");

export const createItem = (
  optionId: string,
  body: {
    foodId: string;
    quantityGrams: number;
    isLocked?: boolean;
    substitutionGroupId?: string | null;
  },
): Promise<PlanoItemDto> =>
  escrever<PlanoItemDto>(
    "POST",
    `/nutri/options/${id(optionId)}/items`,
    "createItem",
    body,
  );

export const updateItem = (
  itemId: string,
  patch: Record<string, unknown>,
): Promise<PlanoItemDto> =>
  escrever<PlanoItemDto>(
    "PATCH",
    `/nutri/items/${id(itemId)}`,
    "updateItem",
    patch,
  );

export const deleteItem = (itemId: string): Promise<void> =>
  apagar(`/nutri/items/${id(itemId)}`, "deleteItem");

/* ═══════════ catálogo ═══════════ */

export const searchFoods = (
  q = "",
  limit = 600,
  offset = 0,
): Promise<FoodsResponse> =>
  get<FoodsResponse>(
    `/nutri/foods?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`,
    "searchFoods",
  );

export const listGroups = (): Promise<GruposResponse> =>
  get<GruposResponse>("/nutri/substitution-groups", "listGroups");

/* ═══════════ relatório (015, consumido sem alteração) ═══════════ */

export const getCycleReport = (
  patientId: string,
  cycleId: string,
): Promise<CycleReportResponse> =>
  get<CycleReportResponse>(
    `/nutri/patients/${id(patientId)}/cycles/${id(cycleId)}/report`,
    "getCycleReport",
  );

/* ═══════════ diagnóstico de falha ═══════════ */

/** Diagnóstico em uma frase, com o próximo passo (US3). Sem stack trace na tela. */
export function explicarFalha(e: unknown): {
  readonly titulo: string;
  readonly detalhe: string;
} {
  if (e instanceof ConfigError) {
    return { titulo: "Falta configurar a credencial", detalhe: e.message };
  }
  if (e instanceof ApiError && e.isNetworkError) {
    return {
      titulo: "A API não respondeu",
      // Cita as DUAS portas de propósito: os scripts da API discordam
      // (`dev` sobe na 3333, `start` na 3000), e uma mensagem que manda rodar
      // `dev` citando a 3000 não resolve nada — foi assim que este caminho
      // apareceu pela primeira vez.
      detalhe: `Não foi possível conectar em ${API_URL}. Suba a API nessa porta ou ajuste API_URL no .env da raiz — \`pnpm --filter api dev\` sobe na 3333, \`pnpm --filter api start\` na 3000.`,
    };
  }
  if (e instanceof ApiError && e.status === 403) {
    return {
      titulo: "Credencial recusada",
      detalhe:
        "A API respondeu 403: o valor de NUTRI_API_KEY no web não é o mesmo que o da API.",
    };
  }
  if (e instanceof ApiError) {
    return {
      titulo: `A API respondeu ${e.status}`,
      detalhe: e.message,
    };
  }
  return {
    titulo: "Erro inesperado",
    detalhe: e instanceof Error ? e.message : String(e),
  };
}

/** O status HTTP da falha, ou 0 se não houve resposta. Usado pelas ações para
 *  escolher o código de erro que volta na URL (`lib/erros.ts`). */
export function statusDaFalha(e: unknown): number {
  return e instanceof ApiError ? e.status : -1;
}
