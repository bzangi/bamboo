// Roster da nutri — a porta de entrada (015) e o cadastro (016). Server
// Component: o fetch, a escrita e a credencial ficam no servidor.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NutriPatientDto } from "@bamboo/types";
import { createPatient, explicarFalha, listPatients } from "../lib/nutri";
import { dataCurta, diaDoCiclo } from "../lib/format";
import s from "./nutri.module.css";

const NOME_MAX = 120;

// A falha volta pela URL como CÓDIGO, nunca como texto: nada vindo de fora é
// refletido na página, e dispensa `useActionState` (que exigiria componente
// client, e com ele a chance de a credencial encostar no browser).
const ERROS: Record<string, string> = {
  "nome-invalido": `Nome inválido. Digite de 1 a ${NOME_MAX} caracteres.`,
  api: "Não foi possível cadastrar agora. Confira se a API está no ar e tente de novo.",
};

/**
 * Cadastra o paciente (016). Server Action: roda no servidor, então a
 * credencial continua onde estava.
 *
 * ⚠️ `redirect()` funciona LANÇANDO uma exceção interna do Next — por isso ele
 * nunca pode ficar dentro do `try`, ou o `catch` engole o redirect e a resposta
 * vira erro.
 */
async function cadastrarPaciente(formData: FormData): Promise<void> {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > NOME_MAX) {
    redirect("/?erro=nome-invalido");
  }

  let ok = true;
  try {
    await createPatient(name);
  } catch {
    ok = false;
  }
  if (!ok) redirect("/?erro=api");

  revalidatePath("/");
  redirect("/"); // limpa um ?erro= antigo da barra de endereços
}

// Hoje em data-calendário LOCAL do servidor — a mesma convenção do domínio
// (`localToday` na API, `localDate` nos testes), nunca UTC.
function hojeLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function EstadoDoCiclo({ p }: { p: NutriPatientDto }) {
  const c = p.cicloAtual;
  if (!c) {
    return <span className={`${s.rowState} ${s.rowStateOff}`}>sem ciclo</span>;
  }
  if (c.aberto) {
    return (
      <span className={s.rowState}>
        <span className={s.dot} aria-hidden="true" />
        em ciclo · dia {diaDoCiclo(c.startedOn, hojeLocal())} de{" "}
        {c.expectedDurationDays}
      </span>
    );
  }
  return (
    <span className={s.rowState}>
      último ciclo · {dataCurta(c.startedOn)} → {dataCurta(c.closedOn ?? "")}
    </span>
  );
}

export default async function Pacientes({
  searchParams,
}: {
  // Next 15+: searchParams é Promise.
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const falhaDoCadastro = erro ? (ERROS[erro] ?? ERROS.api) : null;

  let patients: ReadonlyArray<NutriPatientDto>;
  try {
    patients = (await listPatients()).patients;
  } catch (e) {
    const { titulo, detalhe } = explicarFalha(e);
    return (
      <main className={s.page}>
        <p className={s.eyebrow}>Bamboo · visão da nutri</p>
        <h1 className={s.title}>Pacientes</h1>
        <div className={s.card}>
          <p className={s.cardTitle}>{titulo}</p>
          <p className={s.cardBody}>{detalhe}</p>
        </div>
      </main>
    );
  }

  const emCiclo = patients.filter((p) => p.cicloAtual?.aberto).length;

  return (
    <main className={s.page}>
      <div className={s.head}>
        <div>
          <p className={s.eyebrow}>Bamboo · visão da nutri</p>
          <h1 className={s.title}>Pacientes</h1>
        </div>
        <p className={s.rowState}>
          {patients.length} {patients.length === 1 ? "paciente" : "pacientes"} ·{" "}
          {emCiclo} em ciclo
        </p>
      </div>

      {falhaDoCadastro && (
        <div className={s.card}>
          <p className={s.cardTitle}>O paciente não foi cadastrado</p>
          <p className={s.cardBody}>{falhaDoCadastro}</p>
        </div>
      )}

      {patients.length === 0 ? (
        <div className={s.card}>
          <p className={s.cardTitle}>Nenhum paciente ainda</p>
          <p className={s.cardBody}>
            Cadastre o primeiro no campo abaixo. Ele nasce sem plano e sem ciclo
            — o plano é semeado com{" "}
            <span className={s.mono}>pnpm --filter @bamboo/db seed</span> e o
            ciclo se abre na consulta.
          </p>
        </div>
      ) : (
        <ul className={s.list}>
          {patients.map((p) => (
            <li key={p.id}>
              <Link className={s.row} href={`/patients/${p.id}`}>
                <span className={s.rowName}>{p.name}</span>
                <EstadoDoCiclo p={p} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* `<details>` nativo: colapsado por padrão, a tela continua sendo a
          lista. Sem estado, sem componente client. */}
      <details className={s.novo}>
        <summary className={s.novoResumo}>Cadastrar paciente</summary>
        <form className={s.novoForm} action={cadastrarPaciente}>
          <label className={s.novoLabel} htmlFor="name">
            Nome
          </label>
          <input
            className={s.novoInput}
            id="name"
            name="name"
            type="text"
            maxLength={NOME_MAX}
            required
            autoComplete="off"
            placeholder="Ana Ribeiro"
          />
          <button className={s.novoBtn} type="submit">
            Cadastrar
          </button>
        </form>
      </details>
    </main>
  );
}
