// Snackbar efêmero pós-troca de opção: atalho de 1 toque para desfazer a troca
// inteira. NÃO tem timer próprio — o pai (HomeScreen) controla visibilidade e a
// janela (~5s). Só primitivos RN (View/Text/Pressable), no padrão das sheets.
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, shadow, space, text, usePalette, type Palette } from "./theme";

interface Props {
  readonly visible: boolean;
  // Frase pronta ("Trocado para Leve", "Almoço editado") — o balão serve à
  // troca de opção E à edição em lote (020); o texto é do chamador.
  readonly label: string;
  readonly onUndo: () => void;
}

export function UndoSwapToast({ visible, label, onUndo }: Props) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    // box-none: a faixa não captura toques fora do balão.
    <View
      // A tela vai de borda a borda: sem o inset o balão pousaria sobre a barra
      // de gestos do iPhone.
      style={[styles.container, { bottom: insets.bottom + space.md }]}
      pointerEvents="box-none"
    >
      <View style={styles.toast}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityHint="Desfaz a troca e os ajustes das outras refeições"
          hitSlop={8}
        >
          <Text style={styles.undo}>↺ Desfazer</Text>
        </Pressable>
      </View>
    </View>
  );
}

// O balão é tinta sobre papel — a inversão do modo, não um cinza de fábrica.
const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      left: 0,
      right: 0,
      // `bottom` vem do call site: depende do recorte de baixo do aparelho.
      alignItems: "center",
      paddingHorizontal: space.lg,
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: space.lg,
      backgroundColor: c.ink,
      borderRadius: radius.pill,
      paddingVertical: space.md,
      paddingLeft: space.xl,
      paddingRight: space.lg,
      minWidth: 240,
      maxWidth: 480,
      ...shadow.sheet,
    },
    label: { ...text.small, color: c.paper, flexShrink: 1 },
    // O balão inverte com o modo, então a ação NÃO pode ser colorida: o verde
    // que contrasta sobre tinta escura fica ilegível sobre tinta clara. A
    // afordância vem do peso e do sublinhado — que não dependem do modo.
    undo: {
      ...text.small,
      color: c.paper,
      fontWeight: "700",
      textDecorationLine: "underline",
    },
  });
