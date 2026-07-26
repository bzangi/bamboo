// Roster da nutri — a porta de entrada (US1). Server Component: o fetch e a
// credencial ficam no servidor (FR-006). Zero JS no cliente.
import Link from "next/link";
import type { NutriPatientDto } from "@bamboo/types";
import { explicarFalha, listPatients } from "../lib/nutri";
import { dataCurta, diaDoCiclo } from "../lib/format";
import s from "./nutri.module.css";

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

export default async function Pacientes() {
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

      {patients.length === 0 ? (
        <div className={s.card}>
          <p className={s.cardTitle}>Nenhum paciente ainda</p>
          <p className={s.cardBody}>
            O acompanhamento aparece aqui quando existe paciente com plano. No
            ambiente de desenvolvimento, semeie um com{" "}
            <span className={s.mono}>pnpm --filter @bamboo/db seed</span>.
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
    </main>
  );
}
