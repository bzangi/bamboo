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
import { Card, CardContent } from "@/components/ui/card";
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
        <Cabecalho titulo="Pacientes" />
        <Falha titulo={titulo} detalhe={detalhe} />
      </Pagina>
    );
  }

  const emCiclo = patients.filter((p) => p.cicloAtual?.aberto).length;

  return (
    <Pagina>
      <Cabecalho
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
        // A tabela vive DENTRO de um cartão: solta no papel, com 4 linhas numa
        // coluna de 64rem, ela vira três fiapos de régua flutuando. O cartão é o
        // que diz "isto é uma coisa só".
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* `w-full` na 1ª coluna espreme as outras duas para a direita:
                      sem isso, três colunas curtas se espalham e abrem um vão
                      morto entre o estado e as ações. */}
                  <TableHead className="w-full">Paciente</TableHead>
                  <TableHead className="whitespace-nowrap">
                    Acompanhamento
                  </TableHead>
                  <TableHead className="text-right">Abrir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-foreground">
                      <Link
                        className="hover:underline"
                        href={`/patients/${p.id}`}
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <EstadoDoCiclo p={p} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* `<details>` nativo: colapsado por padrão, a tela continua sendo a
          lista. Sem estado, sem componente client. */}
      {/* `<details>` nativo, colapsado: a tela continua sendo a lista. O "+" é
          nosso porque o marcador do sistema não pertence a este design (o
          triângulo nativo está escondido no globals.css). */}
      <details className="group rounded-md border border-dashed border-border">
        <summary className="flex items-center gap-2 px-5 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <span
            aria-hidden="true"
            className="font-mono text-base leading-none text-subtle group-open:hidden"
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="hidden font-mono text-base leading-none text-subtle group-open:inline"
          >
            −
          </span>
          Cadastrar paciente
        </summary>
        <form
          className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4"
          action={cadastrarPaciente}
        >
          {/* Largura de um nome, não da tela: um campo de 1100 px para "Ana
              Ribeiro" faz o formulário parecer que perdeu o layout. */}
          <div className="flex w-full max-w-sm flex-col gap-1.5">
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
