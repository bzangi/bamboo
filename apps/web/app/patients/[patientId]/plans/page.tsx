// Os planos de um paciente (017 / US2): listar, criar, renomear, ativar, excluir.
//
// O plano nasce VAZIO — o grafo se monta na tela do plano. Aqui a nutri decide
// QUAL plano vale hoje, e é por isso que "Ativar" é um botão próprio e não um
// campo do formulário de renomear: ativar é o ato que o ciclo observa (007).
import Link from "next/link";
import type { NutriPatientDto, PlanoResumoDto } from "@bamboo/types";
import {
  Aviso,
  CabecalhoDoPaciente,
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
import { dataCurta, findPatient } from "@/lib/format";
import { explicarFalha, listPatients, listPlans } from "@/lib/nutri";
import {
  ativarPlano,
  criarPlano,
  excluirPlano,
  renomearPlano,
} from "../../../acoes";

/** O que falta para o plano servir ao app do paciente, em uma frase. */
function Pendencia({ p }: { p: PlanoResumoDto }) {
  if (p.dayTypeCount === 0) {
    return <Badge variant="pulei">sem tipo-de-dia</Badge>;
  }
  if (p.mealCount === 0) return <Badge variant="pulei">sem refeição</Badge>;
  if (!p.semanaCompleta) {
    return <Badge variant="pulei">semana não programada</Badge>;
  }
  return <Badge variant="feito">pronto para uso</Badge>;
}

export default async function Planos({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { patientId } = await params;
  const { erro } = await searchParams;

  let paciente: NutriPatientDto | undefined;
  let plans: ReadonlyArray<PlanoResumoDto>;
  try {
    // O nome vem da roster (015/D1): a regra de "qual paciente" tem uma fonte.
    paciente = findPatient((await listPatients()).patients, patientId);
    plans = (await listPlans(patientId)).plans;
  } catch (e) {
    const { titulo, detalhe } = explicarFalha(e);
    return (
      <Pagina>
        <CabecalhoDoPaciente
          patientId={patientId}
          nome="Paciente"
          ativa="planos"
        />
        <Falha titulo={titulo} detalhe={detalhe} />
      </Pagina>
    );
  }

  const nome = paciente?.name ?? "paciente";

  return (
    <Pagina>
      <CabecalhoDoPaciente patientId={patientId} nome={nome} ativa="planos" />

      <Aviso codigo={erro} />

      {plans.length === 0 && (
        <Vazio titulo="Nenhum plano ainda">
          Crie o primeiro abaixo. Ele nasce vazio e já ativo; os tipos-de-dia,
          as refeições, as opções e os itens se montam na tela do plano.
        </Vazio>
      )}

      <div className="flex flex-col gap-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="text-base font-semibold text-foreground hover:underline"
                    href={`/patients/${patientId}/plans/${p.id}`}
                  >
                    {p.name}
                  </Link>
                  {p.isActive ? (
                    <Badge variant="feito">ativo</Badge>
                  ) : (
                    <Badge variant="contorno">inativo</Badge>
                  )}
                  <Pendencia p={p} />
                </div>
                <Link href={`/patients/${patientId}/plans/${p.id}`}>
                  <Button size="sm">Montar plano</Button>
                </Link>
              </div>

              <Mono className="text-subtle">
                {p.dayTypeCount}{" "}
                {p.dayTypeCount === 1 ? "tipo-de-dia" : "tipos-de-dia"} ·{" "}
                {p.mealCount} {p.mealCount === 1 ? "refeição" : "refeições"} ·
                criado em {dataCurta(p.createdAt.slice(0, 10))}
              </Mono>

              <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                <form
                  className="flex flex-wrap items-end gap-2"
                  action={renomearPlano}
                >
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="planId" value={p.id} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`nome-${p.id}`}>Nome do plano</Label>
                    <Input
                      id={`nome-${p.id}`}
                      name="name"
                      defaultValue={p.name}
                      maxLength={120}
                      required
                      className="w-64"
                      autoComplete="off"
                    />
                  </div>
                  <Button variant="outline" size="sm" type="submit">
                    Renomear
                  </Button>
                </form>

                {!p.isActive && (
                  <form action={ativarPlano}>
                    <input type="hidden" name="patientId" value={patientId} />
                    <input type="hidden" name="planId" value={p.id} />
                    <Button variant="outline" size="sm" type="submit">
                      Ativar
                    </Button>
                  </form>
                )}

                <form action={excluirPlano}>
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="planId" value={p.id} />
                  <Button variant="destructive" size="sm" type="submit">
                    Excluir
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <details
        className="rounded-md border border-dashed border-border"
        open={plans.length === 0}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          Criar plano
        </summary>
        <form
          className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3"
          action={criarPlano}
        >
          <input type="hidden" name="patientId" value={patientId} />
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="novo-plano">Nome</Label>
            <Input
              id="novo-plano"
              name="name"
              maxLength={120}
              required
              autoComplete="off"
              placeholder="Plano de julho"
            />
          </div>
          <Button type="submit">Criar</Button>
        </form>
      </details>
    </Pagina>
  );
}
