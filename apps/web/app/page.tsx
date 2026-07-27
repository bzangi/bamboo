// Roster da nutri — a porta de entrada (015), o cadastro (016) e agora o caminho
// para a ficha e para os planos (017). Server Component: o fetch, a escrita e a
// credencial ficam no servidor.
import Link from "next/link";
import type { NutriPatientDto } from "@bamboo/types";
import {
  Aviso,
  Cabecalho,
  Falha,
  Mono,
  Pagina,
  Vazio,
} from "@/components/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataCurta, diaDoCiclo } from "@/lib/format";
import { explicarFalha, listPatients } from "@/lib/nutri";
import { cadastrarPaciente } from "./acoes";

const NOME_MAX = 120;

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
  if (!c) return <Badge variant="contorno">sem ciclo</Badge>;
  if (c.aberto) {
    return (
      <Badge variant="feito">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        em ciclo · dia {diaDoCiclo(c.startedOn, hojeLocal())} de{" "}
        {c.expectedDurationDays}
      </Badge>
    );
  }
  return (
    <Badge variant="neutro">
      último ciclo · {dataCurta(c.startedOn)} → {dataCurta(c.closedOn ?? "")}
    </Badge>
  );
}

export default async function Pacientes({
  searchParams,
}: {
  // Next 15+: searchParams é Promise.
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  let patients: ReadonlyArray<NutriPatientDto>;
  try {
    patients = (await listPatients()).patients;
  } catch (e) {
    const { titulo, detalhe } = explicarFalha(e);
    return (
      <Pagina>
        <Cabecalho sobrescrito="Bamboo · visão da nutri" titulo="Pacientes" />
        <Falha titulo={titulo} detalhe={detalhe} />
      </Pagina>
    );
  }

  const emCiclo = patients.filter((p) => p.cicloAtual?.aberto).length;

  return (
    <Pagina>
      <Cabecalho
        sobrescrito="Bamboo · visão da nutri"
        titulo="Pacientes"
        direita={
          <Mono className="text-muted-foreground">
            {patients.length} {patients.length === 1 ? "paciente" : "pacientes"}{" "}
            · {emCiclo} em ciclo
          </Mono>
        }
      />

      <Aviso codigo={erro} />

      {patients.length === 0 ? (
        <Vazio titulo="Nenhum paciente ainda">
          Cadastre o primeiro no campo abaixo. Ele nasce sem plano e sem ciclo —
          o plano se monta em <Mono>Planos</Mono> e o ciclo se abre na consulta.
        </Vazio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Acompanhamento</TableHead>
              <TableHead className="text-right">Abrir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-foreground">
                  <Link className="hover:underline" href={`/patients/${p.id}`}>
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <EstadoDoCiclo p={p} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Link href={`/patients/${p.id}`}>
                    <Button variant="ghost" size="xs">
                      Acompanhamento
                    </Button>
                  </Link>
                  <Link href={`/patients/${p.id}/plans`}>
                    <Button variant="ghost" size="xs">
                      Planos
                    </Button>
                  </Link>
                  <Link href={`/patients/${p.id}/ficha`}>
                    <Button variant="ghost" size="xs">
                      Ficha
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* `<details>` nativo: colapsado por padrão, a tela continua sendo a
          lista. Sem estado, sem componente client. */}
      <details className="rounded-md border border-dashed border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          Cadastrar paciente
        </summary>
        <form
          className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3"
          action={cadastrarPaciente}
        >
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              type="text"
              maxLength={NOME_MAX}
              required
              autoComplete="off"
              placeholder="Ana Ribeiro"
            />
          </div>
          <Button type="submit">Cadastrar</Button>
        </form>
      </details>
    </Pagina>
  );
}
