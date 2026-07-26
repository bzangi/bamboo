// URL de paciente que não existe (ou rota errada): dizer o que houve e dar o
// caminho de volta. Vazio e falha são momento de direção, não de tela morta.
import Link from "next/link";
import s from "./nutri.module.css";

export default function NaoEncontrado() {
  return (
    <main className={s.page}>
      <p className={s.eyebrow}>Bamboo · visão da nutri</p>
      <h1 className={s.title}>Página não encontrada</h1>
      <div className={s.card}>
        <p className={s.cardTitle}>Esse endereço não existe</p>
        <p className={s.cardBody}>
          O paciente pode ter sido removido, ou o link está incompleto.
        </p>
      </div>
      <p style={{ marginTop: "1.5rem" }}>
        <Link className={s.back} href="/">
          ← pacientes
        </Link>
      </p>
    </main>
  );
}
