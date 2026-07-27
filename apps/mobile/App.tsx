import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/ErrorBoundary";
import { HomeScreen } from "./src/HomeScreen";
import { installGlobalErrorHandler } from "./src/error-handler";
import { usePalette } from "./src/theme";

// Instala o handler global + loga o boot o quanto antes (no import do módulo,
// antes do React montar) — assim erros logo no começo já caem no console.
installGlobalErrorHandler();

export default function App() {
  const c = usePalette();
  return (
    // `View`, não `SafeAreaView`: a tela vai de borda a borda, então a barra de
    // vidro passa POR BAIXO do relógio/bateria (é o que faz o vidro ter função)
    // e o conteúdo rola atravessando o topo em vez de sumir numa linha invisível.
    // Quem respeita o recorte agora é cada superfície, pelo inset do provider.
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: c.paper }]}>
        {/* `auto` inverte a barra junto com o modo do sistema; fixo em "dark" a
            hora do relógio sumia no papel escuro. */}
        <StatusBar style="auto" />
        <ErrorBoundary>
          <HomeScreen />
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
