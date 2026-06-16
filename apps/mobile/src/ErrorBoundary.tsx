import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { log } from "./logger";

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
      return (
        <View style={styles.root}>
          <Text style={styles.title}>Algo quebrou na tela</Text>
          <Text style={styles.detail}>{this.state.error.message}</Text>
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
    padding: 24,
  },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  detail: { fontSize: 14, color: "#666", textAlign: "center" },
});
