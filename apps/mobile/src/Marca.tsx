// A marca do produto no app do paciente: a MESMA do header da web (e do favicon)
// — o colmo, dois nós numa haste. O glifo é desenhado com três `View`: são três
// retângulos, e `react-native-svg` é um módulo nativo inteiro para isso.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palettes, space, text, usePalette, type Palette } from "./theme";

/** Altura do conteúdo da barra (sem o recorte do topo, que varia por aparelho).
 *  Quem rola por baixo dela precisa saber quanto reservar. */
export const ALTURA_BARRA = space.sm + 32 + space.sm;

/** Barra fixa no topo, em vidro jateado: o conteúdo passa por baixo e continua
 *  legível porque o blur come o contraste do que está atrás. Vem DEPOIS do
 *  ScrollView no JSX — no RN quem vem depois fica em cima.
 *
 *  `compacto` = o cabeçalho da tela saiu de vista. Aí a barra ganha o separador
 *  e o que vier em `children` (a pílula do tipo-de-dia), pra trocar o dia sem
 *  precisar rolar o plano inteiro de volta. */
export function BarraMarca({
  compacto,
  children,
}: {
  readonly compacto: boolean;
  readonly children?: React.ReactNode;
}) {
  const c = usePalette();
  const styles = makeStyles(c);
  // O recorte do topo (relógio, bateria) vira padding DA BARRA: o vidro cobre a
  // faixa de status, a marca fica abaixo dela.
  const insets = useSafeAreaInsets();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: compacto ? 1 : 0,
      duration: 180,
      // Opacidade e translate rodam na thread nativa: a transição não depende do
      // JS, que durante a rolagem é justamente quem está ocupado.
      useNativeDriver: true,
    }).start();
  }, [compacto, t]);

  return (
    <BlurView
      // 28: vidro, não leitosa. Acima de ~60 a barra vira uma faixa opaca e o
      // "passa por baixo" desaparece.
      intensity={28}
      tint={c === palettes.dark ? "dark" : "light"}
      style={[styles.barra, { paddingTop: insets.top + space.sm }]}
      // ponytail: iOS tem o blur de graça; no Android o expo-blur exige envolver
      // a tela num BlurTargetView — fica semitransparente até alguém rodar o app
      // num Android e reclamar.
    >
      <Colmo c={c} />
      {/* Nome e pílula dividem o MESMO vão, sobrepostos: é isso que faz o nome
          colapsar de verdade (não sobra caixa vazia) sem animar `width`, que o
          driver nativo não sabe animar. Um sai deslizando pra esquerda, o outro
          entra da direita. */}
      <View style={styles.vao}>
        <Animated.View
          style={[
            styles.vaoItem,
            {
              opacity: t.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
              transform: [
                {
                  translateX: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -14],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.nome}>Bamboo</Text>
        </Animated.View>
        {children ? (
          <Animated.View
            style={[
              styles.vaoItem,
              {
                opacity: t,
                transform: [
                  {
                    translateX: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
            // Invisível não pode ser tocável: sem isto, um toque no vazio da barra
            // abriria o seletor de tipo-de-dia.
            pointerEvents={compacto ? "auto" : "none"}
          >
            <View style={styles.separador} />
            {children}
          </Animated.View>
        ) : null}
      </View>
    </BlurView>
  );
}

function Colmo({ c }: { readonly c: Palette }) {
  const styles = makeStyles(c);
  return (
    <View style={styles.glifo}>
      <View style={styles.haste} />
      <View style={[styles.no, { top: 7 }]} />
      <View style={[styles.no, { top: 14 }]} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    barra: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingHorizontal: space.lg,
      paddingBottom: space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    // Mesmas proporções do SVG da web (caixa 10×22).
    glifo: { width: 10, height: 22, alignItems: "center" },
    haste: {
      position: "absolute",
      top: 1,
      width: 1.5,
      height: 20,
      borderRadius: 1,
      backgroundColor: c.feito,
    },
    no: { position: "absolute", width: 7, height: 1, backgroundColor: c.sand },
    nome: { ...text.label, color: c.ink2 },
    // Altura da pílula, fixa: a barra não pode crescer quando a pílula entra —
    // barra que muda de altura no meio da rolagem empurra o conteúdo.
    vao: { flex: 1, height: 32, justifyContent: "center" },
    vaoItem: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
    },
    // O "|" do pedido: um fio, não um caractere — alinha com a altura da pílula.
    separador: { width: 1, height: 16, backgroundColor: c.line },
  });
