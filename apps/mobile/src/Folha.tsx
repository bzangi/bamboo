// A folha modal do app — UMA. O mesmo trio backdrop + cartão + pegador estava
// copiado verbatim em 4 arquivos (as 3 sheets e o seletor de tipo-de-dia), com
// nada além do `maxHeight` variando entre eles. Quatro cópias de um material é
// como um material se perde: basta alguém ajustar o canto num lugar.
//
// Materialidade iOS 26/Tahoe: canto contínuo grande no topo, o véu por trás em
// tinta translúcida (não preto puro) e a sombra projetada para CIMA — é o que
// faz a folha parecer subir do papel em vez de ser um retângulo colado.
import { useMemo, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { radius, shadow, space, text, usePalette, type Palette } from "./theme";

export function Folha({
  visible,
  onClose,
  titulo,
  legenda,
  maxHeight = "85%",
  children,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly titulo: string;
  /** Linha de contexto sob o título ("Atual: arroz"). */
  readonly legenda?: string;
  readonly maxHeight?: `${number}%`;
  readonly children: ReactNode;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop: tocar fora fecha a folha. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* O cartão engole o toque, para não vazar para o backdrop. */}
        <Pressable style={[styles.folha, { maxHeight }]} onPress={() => {}}>
          <View style={styles.pegador} />
          <Text style={styles.titulo}>{titulo}</Text>
          {legenda ? <Text style={styles.legenda}>{legenda}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: c.veil, justifyContent: "flex-end" },
    folha: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: space.xl,
      paddingTop: space.md,
      paddingBottom: space.xxl,
      ...shadow.sheet,
    },
    pegador: {
      alignSelf: "center",
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.line,
      marginBottom: space.lg,
    },
    titulo: { ...text.sheetTitle, color: c.ink },
    legenda: { ...text.small, color: c.ink2, marginTop: space.xs },
  });
