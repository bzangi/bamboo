// A tela do paciente (US2): o ciclo atual lido em cinco segundos — adesão,
// evolução, padrão de registro, comparativo. Server Component; nenhum número é
// recalculado aqui (FR-007), só formatado.
import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  CycleReportResponse,
  FlagsFrequenciaDto,
  RegistroTotaisDto,
} from "@bamboo/types";
import {
  explicarFalha,
  getCycleReport,
  listPatients,
} from "../../../lib/nutri";
import {
  contarDias,
  dataCurta,
  deltaPontos,
  diaDoCiclo,
  findPatient,
  pct01,
  pct100,
  taxas,
  type Tom,
} from "../../../lib/format";
import s from "../../nutri.module.css";

// O typegen do Next tipa classe de CSS module como `string | undefined`.
const TOM: Record<Tom, string | undefined> = {
  bom: s.tomBom,
  ruim: s.tomRuim,
  neutro: s.tomNeutro,
  "sem-dado": s.tomSemDado,
};

// Recebe TEXTO, nunca a exceção. Passar a instância de `Error` como prop de
// componente explode a serialização do React Flight com um erro que não explica
// nada ("chunk.reason.enqueueModel is not a function") — e o 500 acontece no
// caminho que existe justamente para não haver 500. `explicarFalha` roda no
// chamador; daqui para baixo só trafega string.
function Falha({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className={s.card}>
      <p className={s.cardTitle}>{titulo}</p>
      <p className={s.cardBody}>{detalhe}</p>
    </div>
  );
}

function Voltar() {
  return (
    <Link className={s.back} href="/">
      ← pacientes
    </Link>
  );
}

/** Flags por macro: só as que ocorreram. É o que a nutri age em cima. */
function flagsEmTexto(f: FlagsFrequenciaDto): string[] {
  const nome = { carb: "carboidrato", protein: "proteína", fat: "gordura" };
  return (["carb", "protein", "fat"] as const).flatMap((k) =>
    (["acima", "abaixo"] as const).flatMap((dir) => {
      const n = f[k]?.[dir] ?? 0;
      return n > 0
        ? [`${nome[k]} ${dir} em ${n} ${n === 1 ? "dia" : "dias"}`]
        : [];
    }),
  );
}

/** Ordem FIXA das séries — nunca ciclada, nunca por ranking. `hachura` marca a
 *  fatia que é ausência de dado, não série. */
const SERIES = [
  { chave: "feito", nome: "feito", cor: "var(--feito)", hachura: false },
  { chave: "troquei", nome: "troquei", cor: "var(--troquei)", hachura: false },
  { chave: "pulei", nome: "pulei", cor: "var(--pulei)", hachura: false },
  {
    chave: "semRegistro",
    nome: "sem registro",
    cor: "var(--sem-registro)",
    hachura: true,
  },
] as const satisfies ReadonlyArray<{
  chave: keyof RegistroTotaisDto;
  nome: string;
  cor: string;
  hachura: boolean;
}>;

function BarraEmpilhada({
  t,
  className,
}: {
  t: RegistroTotaisDto;
  className: string | undefined;
}) {
  const x = taxas(t);
  if (x.vazio) {
    return (
      <div className={className}>
        <div className={s.stackEmpty} title="nenhuma refeição no período" />
      </div>
    );
  }
  return (
    <div className={className}>
      {SERIES.filter((seg) => t[seg.chave] > 0).map((seg) => (
        <div
          key={seg.nome}
          className={seg.hachura ? s.segSemRegistro : undefined}
          style={{
            flexGrow: x[seg.chave].pctExato,
            background: seg.hachura ? undefined : seg.cor,
          }}
          title={`${seg.nome}: ${t[seg.chave]} (${x[seg.chave].label})`}
        />
      ))}
    </div>
  );
}

export default async function Paciente({
  params,
}: {
  // Next 15+: params é Promise.
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  // A roster é também a fonte de nome + ciclo atual (D1).
  // ponytail: relê a lista inteira para achar um paciente; vira
  // GET /nutri/patients/:id quando a roster passar de algumas centenas.
  let roster;
  try {
    roster = (await listPatients()).patients;
  } catch (e) {
    return (
      <main className={s.page}>
        <Voltar />
        <Falha {...explicarFalha(e)} />
      </main>
    );
  }

  const paciente = findPatient(roster, patientId);
  if (!paciente) notFound();

  const ciclo = paciente.cicloAtual;

  if (!ciclo) {
    return (
      <main className={s.page}>
        <Voltar />
        <p className={s.eyebrow}>paciente</p>
        <h1 className={s.title}>{paciente.name}</h1>
        <div className={s.card}>
          <p className={s.cardTitle}>Sem ciclo de acompanhamento</p>
          <p className={s.cardBody}>
            O acompanhamento começa quando você abre o ciclo na consulta. A
            partir daí, adesão e padrão de registro deste paciente aparecem
            nesta tela.
          </p>
        </div>
      </main>
    );
  }

  let report: CycleReportResponse;
  try {
    report = await getCycleReport(patientId, ciclo.id);
  } catch (e) {
    return (
      <main className={s.page}>
        <Voltar />
        <p className={s.eyebrow}>paciente</p>
        <h1 className={s.title}>{paciente.name}</h1>
        <Falha {...explicarFalha(e)} />
      </main>
    );
  }

  const { cycle, adesao, registro, semanas, comparativo } = report;
  const janela = cycle.janelaEfetiva;
  const diasDeJanela = contarDias(janela.from, janela.to);
  const flags = flagsEmTexto(adesao.flagsFrequencia);
  const totalTotais = taxas(registro.totais);

  return (
    <main className={s.page}>
      <Voltar />

      <div className={s.head}>
        <div>
          <p className={s.eyebrow}>paciente</p>
          <h1 className={s.title}>{paciente.name}</h1>
        </div>
        <p className={s.rowState}>
          {cycle.aberto ? (
            <>
              ciclo aberto · dia {diaDoCiclo(cycle.startedOn, janela.to)} de{" "}
              {cycle.expectedDurationDays} · retrato parcial até hoje
            </>
          ) : (
            <>
              ciclo fechado · {dataCurta(janela.from)} → {dataCurta(janela.to)}{" "}
              · {diasDeJanela} dias
            </>
          )}
        </p>
      </div>

      {/* ───── adesão ───── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Adesão no ciclo</h2>
        <div className={s.hero}>
          <div>
            <p className={s.figure}>{pct100(adesao.media)}</p>
            <p className={s.figureLabel}>adesão média</p>
          </div>
          <div className={s.stats}>
            <div className={s.stat}>
              <p className={s.statValue}>
                {adesao.diasComDado}
                <span className={s.rowState}>
                  /{adesao.diasComDado + adesao.diasSemDado}
                </span>
              </p>
              <p className={s.statLabel}>dias com registro</p>
            </div>
            <div className={s.stat}>
              <p className={s.statValue}>{adesao.diasDentroFaixa}</p>
              <p className={s.statLabel}>dias na faixa-alvo</p>
            </div>
            <div className={s.stat}>
              <p className={s.statValue}>{pct01(adesao.coberturaMedia)}</p>
              <p className={s.statLabel}>cobertura do registro</p>
            </div>
          </div>
        </div>
        {adesao.diasComDado === 0 ? (
          <p className={s.note}>
            Nenhum dia deste ciclo tem registro ainda. A adesão aparece quando o
            paciente registra a primeira refeição.
          </p>
        ) : flags.length > 0 ? (
          <p className={s.note}>
            Fora da faixa por macro: {flags.join(" · ")}.
          </p>
        ) : null}
      </section>

      {/* ───── semana a semana: o colmo ───── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          Adesão semana a semana · escala 0–100%
        </h2>
        <div className={s.culmScroll}>
          <div className={s.culm}>
            {semanas.map((sem) => {
              const dias = contarDias(sem.from, sem.to);
              const media = sem.adesao.media;
              return (
                <div
                  key={sem.indice}
                  className={s.week}
                  style={{ flexGrow: dias }}
                  title={`semana ${sem.indice} · ${dataCurta(sem.from)} → ${dataCurta(sem.to)} · ${dias} dias · adesão ${pct100(media)}`}
                >
                  <span className={s.weekValue}>{pct100(media)}</span>
                  {media === null ? (
                    <div className={s.weekEmpty} />
                  ) : (
                    <div
                      className={s.weekFill}
                      style={{ height: `${Math.max(media, 1)}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className={s.culmAxis}>
            {semanas.map((sem) => (
              <div
                key={sem.indice}
                className={s.axisCell}
                style={{ flexGrow: contarDias(sem.from, sem.to) }}
              >
                sem {sem.indice}
                {sem.parcial ? (
                  <span className={s.partial}> · parcial</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <p className={s.note}>
          A largura de cada semana é o número de dias dela — a semana parcial é
          mais curta porque é mais curta. Semana sem nenhum registro aparece
          hachurada, não zerada.
        </p>
      </section>

      {/* ───── padrão de registro ───── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>
          Como registrou · {totalTotais.total} refeições
        </h2>
        <BarraEmpilhada t={registro.totais} className={s.stack} />
        <ul className={s.legend}>
          {SERIES.map((l) => (
            <li key={l.nome} className={s.legendItem}>
              <span
                className={`${s.swatch} ${l.hachura ? s.segSemRegistro : ""}`}
                style={{ background: l.hachura ? undefined : l.cor }}
                aria-hidden="true"
              />
              {l.nome}{" "}
              <span className={s.legendValue}>{registro.totais[l.chave]}</span>
            </li>
          ))}
        </ul>

        {registro.porRefeicao.length > 0 && (
          <div className={s.scroll}>
            <table className={s.meals}>
              <thead>
                <tr>
                  <th scope="col">Refeição</th>
                  <th scope="col">Feito</th>
                  <th scope="col">Troquei</th>
                  <th scope="col">Pulei</th>
                  <th scope="col">Sem registro</th>
                  <th scope="col">Padrão</th>
                </tr>
              </thead>
              <tbody>
                {registro.porRefeicao.map((r) => (
                  <tr key={`${r.position}-${r.nome}`}>
                    <td>{r.nome}</td>
                    <td>{r.feito}</td>
                    <td>{r.troquei}</td>
                    <td>{r.pulei}</td>
                    <td>{r.semRegistro}</td>
                    <td>
                      <BarraEmpilhada t={r} className={s.mealBar} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───── comparativo ───── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Comparado ao ciclo anterior</h2>
        {comparativo === null ? (
          <p className={s.note}>
            Este é o primeiro ciclo com dados deste paciente — não há ciclo
            anterior para comparar.
          </p>
        ) : (
          <>
            <p className={s.note}>
              Ciclo de {dataCurta(comparativo.cicloAnterior.startedOn)} a{" "}
              {dataCurta(comparativo.cicloAnterior.closedOn)} · adesão média{" "}
              {pct100(comparativo.cicloAnterior.adesao.media)}.
            </p>
            <ul className={s.deltas}>
              {[
                {
                  label: "adesão média",
                  d: deltaPontos(comparativo.deltas.media, {
                    fator: 1,
                    bomSeSobe: true,
                  }),
                },
                {
                  label: "cobertura",
                  d: deltaPontos(comparativo.deltas.coberturaMedia, {
                    fator: 100,
                    bomSeSobe: true,
                  }),
                },
                {
                  label: "feito",
                  d: deltaPontos(comparativo.deltas.taxaFeito, {
                    fator: 100,
                    bomSeSobe: true,
                  }),
                },
                {
                  // Trocar é adaptação, não falha: sem direção "boa".
                  label: "troquei",
                  d: deltaPontos(comparativo.deltas.taxaTroquei, {
                    fator: 100,
                    bomSeSobe: null,
                  }),
                },
                {
                  label: "pulei",
                  d: deltaPontos(comparativo.deltas.taxaPulei, {
                    fator: 100,
                    bomSeSobe: false,
                  }),
                },
              ].map((x) => (
                <li key={x.label} className={s.delta}>
                  <p className={s.deltaLabel}>{x.label}</p>
                  <p className={`${s.deltaValue} ${TOM[x.d.tom]}`}>
                    {x.d.label}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
