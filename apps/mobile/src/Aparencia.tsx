// O controle de aparência: o glifo na barra de vidro e a folha com os três
// modos. Auto-contido de propósito — o `visible` não tem relação com nada mais
// na tela, então subir esse estado para a `HomeScreen` só faria a tela de 1300
// linhas crescer. Aqui dentro, o `Marca.tsx` só precisa renderizar o botão.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Folha } from "./Folha";
import {
  applyThemeMode,
  radius,
  space,
  text,
  useThemeMode,
  usePalette,
  type Palette,
} from "./theme";
import type { ThemeMode } from "./theme-mode";

// "Automático" primeiro porque é o default e é o que a maioria quer: o app segue
// o telefone. Os outros dois existem para quem quer o contrário disso.
const MODOS: ReadonlyArray<{
  readonly modo: ThemeMode;
  readonly rotulo: string;
}> = [
  { modo: "system", rotulo: "Automático" },
  { modo: "light", rotulo: "Claro" },
  { modo: "dark", rotulo: "Escuro" },
];

export function BotaoAparencia() {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const modo = useThemeMode();
  const [aberta, setAberta] = useState(false);

  return (
    <>
      {/* O glifo é fixo, não indica o modo: quem diz qual está valendo é o "✓"
          da folha. Um ícone que alterna sol/lua mentiria no automático — não há
          como um símbolo dizer "escuro PORQUE o telefone está escuro".
          `◐` é texto (não emoji), então herda a cor da tinta nos dois modos. */}
      <Pressable
        onPress={() => setAberta(true)}
        // O glifo tem ~16px: sem folga o alvo de toque fica abaixo dos 44 que o
        // iOS pede. 16 de folga em volta dá 48.
        hitSlop={space.lg}
        accessibilityRole="button"
        accessibilityLabel="Aparência"
      >
        <Text style={styles.glifo}>◐</Text>
      </Pressable>

      <Folha
        visible={aberta}
        onClose={() => setAberta(false)}
        titulo="Aparência"
        maxHeight="50%"
      >
        <View style={styles.rodape}>
          {MODOS.map(({ modo: m, rotulo }) => {
            const ativo = m === modo;
            return (
              <Pressable
                key={m}
                style={[styles.linha, ativo && styles.linhaAtiva]}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                onPress={() => {
                  applyThemeMode(m);
                  setAberta(false);
                }}
              >
                <Text style={[styles.rotulo, ativo && styles.rotuloAtivo]}>
                  {ativo ? "✓ " : ""}
                  {rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Folha>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    glifo: { ...text.body, color: c.ink3 },
    rodape: { paddingBottom: space.xl, gap: space.xs },
    // Mesmo idioma das linhas do seletor de tipo-de-dia: a opção em vigor vem
    // preenchida com "✓", não só num tom diferente de cinza.
    linha: {
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderRadius: radius.md,
    },
    linhaAtiva: { backgroundColor: c.muted },
    rotulo: { ...text.body, color: c.ink2 },
    rotuloAtivo: { color: c.ink, fontWeight: "600" },
  });
