// A FAIXA do sumário do dia, entre a pílula do tipo-de-dia e a primeira
// refeição. Só desenha; a decisão do que entra na conta mora em `resumo-dia.ts`.
//
// Sem barra de progresso, sem "% da meta", sem cor de alerta: a assinatura do
// produto proíbe o bucket de calorias (vira culpa) e a faixa-alvo não é teto.
// Aqui é leitura — quanto o dia soma — e o eixo que a exposição não liberou
// simplesmente não aparece.
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, shadow, space, text, usePalette, type Palette } from "./theme";
import {
  resumoDoDia,
  temNumero,
  type EntradaResumo,
  type ResumoDia,
} from "./resumo-dia";

export function ResumoDoDia(props: EntradaResumo) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { meals, swaps, trocados, ajustados } = props;
  const r = useMemo(
    () => resumoDoDia({ meals, swaps, trocados, ajustados }),
    [meals, swaps, trocados, ajustados],
  );

  if (!temNumero(r)) return null;

  return (
    <View style={styles.faixa}>
      <View style={styles.linha}>
        <Metrica rotulo="kcal" valor={inteiro(r.kcal)} />
        <Metrica rotulo="carbo" valor={gramas(r.carb)} />
        <Metrica rotulo="prot" valor={gramas(r.protein)} />
        <Metrica rotulo="gord" valor={gramas(r.fat)} />
      </View>
      <Text style={styles.legenda}>o dia como está</Text>
    </View>
  );
}

const inteiro = (v: ResumoDia[keyof ResumoDia]): string | null =>
  v === null ? null : `${Math.round(v)}`;

const gramas = (v: ResumoDia[keyof ResumoDia]): string | null =>
  v === null ? null : `${Math.round(v)} g`;

function Metrica({
  rotulo,
  valor,
}: {
  readonly rotulo: string;
  readonly valor: string | null;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  // Eixo que a exposição não liberou some — escrever "0" seria a tela mentindo.
  if (valor === null) return null;
  return (
    <View style={styles.metrica}>
      <Text style={styles.valor}>{valor}</Text>
      <Text style={styles.rotulo}>{rotulo}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    faixa: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      marginBottom: space.lg,
      ...shadow.card,
    },
    linha: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    metrica: { alignItems: "flex-start" },
    valor: {
      fontSize: 19,
      fontWeight: "600",
      letterSpacing: -0.4,
      color: c.ink,
    },
    rotulo: { ...text.label, color: c.ink3, marginTop: 2 },
    legenda: { ...text.small, color: c.ink3, marginTop: space.sm },
  });
