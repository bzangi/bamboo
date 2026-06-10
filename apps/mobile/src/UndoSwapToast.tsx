// Snackbar efêmero pós-troca de opção: atalho de 1 toque para desfazer a troca
// inteira. NÃO tem timer próprio — o pai (HomeScreen) controla visibilidade e a
// janela (~5s). Só primitivos RN (View/Text/Pressable), no padrão das sheets.
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  readonly visible: boolean;
  readonly optionLabel: string;
  readonly onUndo: () => void;
}

export function UndoSwapToast({ visible, optionLabel, onUndo }: Props) {
  if (!visible) return null;
  return (
    // box-none: a faixa não captura toques fora do balão.
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.toast}>
        <Text style={styles.label} numberOfLines={1}>
          Trocado para {optionLabel}
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

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    backgroundColor: "#323232",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 240,
    maxWidth: 480,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  label: { color: "#fff", fontSize: 14, flexShrink: 1 },
  undo: { color: "#80cbc4", fontSize: 14, fontWeight: "700" },
});
