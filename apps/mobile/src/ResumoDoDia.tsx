// A FAIXA do sumário do dia, entre a pílula do tipo-de-dia e a primeira
// refeição: velocímetros de consumido × meta. Só desenha; a decisão do que
// entra na conta mora em `resumo-dia.ts`.
//
// O arco é feito com Views, sem `react-native-svg`: um anel com dois quadrantes
// pintados (`borderLeft` + `borderBottom`) é um semicírculo; girá-lo de -45° a
// +135° o faz varrer a janela que mostra só a metade de cima. São 3 Views e
// nenhuma dependência nova — a alternativa custaria um módulo nativo para
// desenhar meia rosquinha.
// ponytail: cores por LADO de borda num View arredondado; se o iOS renderizar
// a emenda dos quadrantes com serrilha, o passo é `react-native-svg` (já vem no
// Expo Go) com um `<Path>` — a geometria aqui já está conferida.
//
// Passar da meta NÃO acende alerta: a faixa-alvo não é teto, e comer de menos
// conta igual a comer de mais. O arco satura em cheio e o número diz o resto.
import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, shadow, space, text, usePalette, type Palette } from "./theme";
import {
  fracao,
  sumarioDoDia,
  temNumero,
  type EntradaResumo,
} from "./resumo-dia";

const GRANDE = 152;
const PEQUENO = 82;

export function ResumoDoDia(props: EntradaResumo) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { meals, swaps, trocados, ajustados } = props;
  const { consumido, meta } = useMemo(
    () => sumarioDoDia({ meals, swaps, trocados, ajustados }),
    [meals, swaps, trocados, ajustados],
  );

  if (!temNumero(meta)) return null;

  return (
    <View style={styles.faixa}>
      {meta.kcal !== null ? (
        <Velocimetro
          tamanho={GRANDE}
          espessura={11}
          fracao={fracao(consumido.kcal, meta.kcal)}
          rotulo="kcal"
        >
          <Text style={styles.valorGrande}>{inteiro(consumido.kcal)}</Text>
          <Text style={styles.metaGrande}>de {inteiro(meta.kcal)}</Text>
        </Velocimetro>
      ) : null}

      <View style={styles.macros}>
        <Macro
          rotulo="carbo"
          consumido={consumido.carb}
          meta={meta.carb}
          styles={styles}
        />
        <Macro
          rotulo="prot"
          consumido={consumido.protein}
          meta={meta.protein}
          styles={styles}
        />
        <Macro
          rotulo="gord"
          consumido={consumido.fat}
          meta={meta.fat}
          styles={styles}
        />
      </View>
    </View>
  );
}

function Macro({
  rotulo,
  consumido,
  meta,
  styles,
}: {
  readonly rotulo: string;
  readonly consumido: number | null;
  readonly meta: number | null;
  readonly styles: ReturnType<typeof makeStyles>;
}) {
  // Eixo que a exposição não liberou some — escrever "0" seria a tela mentindo.
  if (meta === null) return null;
  return (
    <Velocimetro
      tamanho={PEQUENO}
      espessura={7}
      fracao={fracao(consumido, meta)}
      rotulo={rotulo}
    >
      <Text style={styles.valorPequeno}>
        {inteiro(consumido)}
        <Text style={styles.metaPequena}>/{inteiro(meta)} g</Text>
      </Text>
    </Velocimetro>
  );
}

function Velocimetro({
  tamanho: W,
  espessura: T,
  fracao: f,
  rotulo,
  children,
}: {
  readonly tamanho: number;
  readonly espessura: number;
  readonly fracao: number;
  readonly rotulo: string;
  readonly children: ReactNode;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const anel = {
    width: W,
    height: W,
    borderRadius: W / 2,
    borderWidth: T,
  } as const;
  return (
    <View style={styles.medidor}>
      {/* Janela: só a metade de cima do anel é visível. */}
      <View style={{ width: W, height: W / 2, overflow: "hidden" }}>
        <View style={[anel, { borderColor: c.muted }]} />
        <View
          style={[
            anel,
            {
              position: "absolute",
              top: 0,
              left: 0,
              borderColor: c.feito,
              borderTopColor: "transparent",
              borderRightColor: "transparent",
              transform: [{ rotate: `${-45 + 180 * f}deg` }],
            },
          ]}
        />
        <View style={styles.dentro}>{children}</View>
      </View>
      <Text style={styles.rotulo}>{rotulo}</Text>
    </View>
  );
}

const inteiro = (v: number | null): string =>
  v === null ? "—" : `${Math.round(v)}`;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    faixa: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: space.lg,
      paddingHorizontal: space.lg,
      marginBottom: space.lg,
      alignItems: "center",
      gap: space.lg,
      ...shadow.card,
    },
    medidor: { alignItems: "center" },
    // O número mora na boca do arco: colado no fundo, centrado.
    dentro: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    valorGrande: {
      fontSize: 30,
      fontWeight: "700",
      letterSpacing: -1,
      color: c.ink,
    },
    metaGrande: { ...text.small, color: c.ink3, marginTop: -2 },
    valorPequeno: { fontSize: 14, fontWeight: "700", color: c.ink },
    metaPequena: { fontSize: 12, fontWeight: "400", color: c.ink3 },
    rotulo: { ...text.label, color: c.ink3, marginTop: space.xs },
    macros: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignSelf: "stretch",
    },
  });
