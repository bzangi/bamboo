import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Bamboo</h1>
        <p>Web da nutri — placeholder. Scaffold da Fase 0.</p>
        <ol>
          <li>
            Edite <code>apps/web/app/page.tsx</code> para começar.
          </li>
          <li>A UI da nutri entra numa fase posterior.</li>
        </ol>
      </main>
    </div>
  );
}
