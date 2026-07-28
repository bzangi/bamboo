import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "./src/ErrorBoundary";
import { HomeScreen } from "./src/HomeScreen";
import { installGlobalErrorHandler } from "./src/error-handler";
import { loadThemeMode, palettes, usePalette } from "./src/theme";

// Instala o handler global + loga o boot o quanto antes (no import do módulo,
// antes do React montar) — assim erros logo no começo já caem no console.
installGlobalErrorHandler();

export default function App() {
  const c = usePalette();

  // A aparência escolhida na sessão anterior. Uma vez, no boot.
  useEffect(() => {
    void loadThemeMode();
  }, []);
  return (
    // `View`, não `SafeAreaView`: a tela vai de borda a borda, então a barra de
    // vidro passa POR BAIXO do relógio/bateria (é o que faz o vidro ter função)
    // e o conteúdo rola atravessando o topo em vez de sumir numa linha invisível.
    // Quem respeita o recorte agora é cada superfície, pelo inset do provider.
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: c.paper }]}>
        {/* Deriva da PALETA, não do sistema: `auto` lê o `useColorScheme()` cru,
            então quem escolhesse escuro num telefone claro ficaria com a hora do
            relógio em tinta escura sobre o papel escuro. */}
        <StatusBar style={c === palettes.dark ? "light" : "dark"} />
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
