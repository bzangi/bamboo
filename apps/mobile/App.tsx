import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { ErrorBoundary } from "./src/ErrorBoundary";
import { HomeScreen } from "./src/HomeScreen";
import { installGlobalErrorHandler } from "./src/error-handler";

// Instala o handler global + loga o boot o quanto antes (no import do módulo,
// antes do React montar) — assim erros logo no começo já caem no console.
installGlobalErrorHandler();

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <HomeScreen />
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
});
