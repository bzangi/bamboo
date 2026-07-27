// A ficha do paciente (017 / US1): editar e excluir.
//
// Rota própria em vez de um card na tela de acompanhamento: aquela tela tem 424
// linhas de visualização com paleta validada (015), e o diff mais curto E mais
// seguro é não encostar nela. A tela de acompanhamento só ganhou os links.
import type { ExposureLevel, NutriPatientDetalheDto } from "@bamboo/types";
import { Aviso, Cabecalho, Falha, Pagina, Trilha } from "@/components/chrome";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { explicarFalha, getPatient } from "@/lib/nutri";
import { editarPaciente, excluirPaciente } from "../../../acoes";

const EXPOSICAO: ReadonlyArray<{ v: ExposureLevel; texto: string }> = [
  { v: "hidden", texto: "Nenhum número" },
  { v: "percent", texto: "Só porcentagem" },
  { v: "macros", texto: "Porcentagem + macros" },
  { v: "full_kcal", texto: "Caloria cheia" },
];

function Campo({
  id,
  rotulo,
  children,
  dica,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
  dica?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica && <p className="text-xs text-subtle">{dica}</p>}
    </div>
  );
}

export default async function Ficha({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { patientId } = await params;
  const { erro } = await searchParams;

  let p: NutriPatientDetalheDto;
  try {
    p = await getPatient(patientId);
  } catch (e) {
    const { titulo, detalhe } = explicarFalha(e);
    return (
      <Pagina>
        <Trilha
          itens={[{ href: "/", texto: "pacientes" }, { texto: "ficha" }]}
        />
        <Falha titulo={titulo} detalhe={detalhe} />
      </Pagina>
    );
  }

  return (
    <Pagina>
      <Trilha
        itens={[
          { href: "/", texto: "pacientes" },
          { href: `/patients/${patientId}`, texto: p.name },
          { texto: "ficha" },
        ]}
      />
      <Cabecalho sobrescrito="ficha do paciente" titulo={p.name} />

      <Aviso codigo={erro} />

      <Card>
        <CardHeader>
          <CardTitle>Dados do paciente</CardTitle>
          <CardDescription>
            Campo deixado em branco é APAGADO — a ficha inteira é enviada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" action={editarPaciente}>
            <input type="hidden" name="patientId" value={patientId} />

            <Campo id="name" rotulo="Nome">
              <Input
                id="name"
                name="name"
                defaultValue={p.name}
                maxLength={120}
                required
                autoComplete="off"
              />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="email" rotulo="E-mail">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={p.email ?? ""}
                  autoComplete="off"
                />
              </Campo>
              <Campo id="phone" rotulo="Telefone">
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={p.phone ?? ""}
                  autoComplete="off"
                />
              </Campo>
              <Campo id="heightCm" rotulo="Altura (cm)">
                <Input
                  id="heightCm"
                  name="heightCm"
                  type="number"
                  step="0.1"
                  min="1"
                  max="300"
                  defaultValue={p.heightCm ?? ""}
                />
              </Campo>
              <Campo id="weightKg" rotulo="Peso (kg)">
                <Input
                  id="weightKg"
                  name="weightKg"
                  type="number"
                  step="0.1"
                  min="1"
                  max="700"
                  defaultValue={p.weightKg ?? ""}
                />
              </Campo>
            </div>

            <Campo
              id="exposure"
              rotulo="Quanto de número o paciente vê"
              dica="O gate de exposição: o app do paciente respeita este nível em todas as telas."
            >
              <Select id="exposure" name="exposure" defaultValue={p.exposure}>
                {EXPOSICAO.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.texto}
                  </option>
                ))}
              </Select>
            </Campo>

            <div>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Excluir paciente</CardTitle>
          <CardDescription>
            Leva os planos e o grafo inteiro deles. É RECUSADO se o paciente já
            tem registro de refeição — histórico de saúde não é apagado por
            exclusão de cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={excluirPaciente}>
            <input type="hidden" name="patientId" value={patientId} />
            <Button variant="destructive" type="submit">
              Excluir {p.name}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Pagina>
  );
}
