import { Component, type ErrorInfo, type ReactNode } from "react";
import { Appearance, StyleSheet, Text, View } from "react-native";
import { log } from "./logger";
import { palettes, space, text } from "./theme";

interface Props {
  readonly children: ReactNode;
}
interface State {
  readonly error: Error | null;
}

// Captura erros de render/lifecycle da árvore React (o que try/catch NÃO pega).
// Loga no console (Metro) e mostra um fallback legível — em vez da tela branca
// muda que o paciente via sem nenhuma pista no console.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error("ErrorBoundary", "erro de render capturado", error);
    if (info.componentStack) {
      log.debug("ErrorBoundary", `componentStack:${info.componentStack}`);
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      // Componente de classe não usa hook; `Appearance` lido no render dá o modo
      // certo na hora do crash, que é a única hora em que esta tela existe.
      const c =
        Appearance.getColorScheme() === "dark" ? palettes.dark : palettes.light;
      return (
        <View style={[styles.root, { backgroundColor: c.paper }]}>
          <Text style={[styles.title, { color: c.ink }]}>
            Algo quebrou na tela
          </Text>
          <Text style={[styles.detail, { color: c.ink2 }]}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  title: { ...text.title, marginBottom: space.sm },
  detail: { ...text.small, textAlign: "center" },
});
