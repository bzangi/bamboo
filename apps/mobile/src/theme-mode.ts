// O modo de tema ESCOLHIDO pela pessoa, e a regra que o cruza com o modo do
// sistema. Antes disto o app só seguia o sistema (`useColorScheme()`), e quem
// prefere escuro de dia — ou claro de noite — não tinha como dizer.
//
// Módulo PURO, sem um único import de `react-native`, e é isto que o justifica
// existir separado do `theme.ts`: o Vitest do app roda em `node` sem stub
// nativo, então esta é a metade da lógica que dá para testar de verdade. O que
// depende de nativo (aplicar no sistema, gravar no disco) mora no `theme.ts`.

export type ThemeMode = "system" | "light" | "dark";

/** Valida o valor que veio do disco — que é de fora do programa. Um
 *  `as ThemeMode` faria disco corrompido, ou gravado por uma versão antiga,
 *  virar modo inválido em silêncio. */
export function parseThemeMode(
  valor: string | null | undefined,
): ThemeMode | null {
  return valor === "system" || valor === "light" || valor === "dark"
    ? valor
    : null;
}

/** O que `useColorScheme()` devolve. Escrito à mão em vez de importado da
 *  `react-native`, que é o que mantém este módulo puro e testável — e a união
 *  tem os dois jeitos de o sistema não dizer nada: `'unspecified'` (o nativo
 *  respondeu "sem preferência") e `null` (ainda não respondeu). */
export type SystemScheme = "light" | "dark" | "unspecified" | null | undefined;

/** A regra inteira: `system` delega, o resto manda. */
export function isDark(modo: ThemeMode, sistema: SystemScheme): boolean {
  return modo === "system" ? sistema === "dark" : modo === "dark";
}

// Estado de módulo de propósito: o modo é UM para o app inteiro, e um Context
// obrigaria a envolver a árvore e a passar o valor por 9 telas que já leem a
// paleta pelo `usePalette()`. `useSyncExternalStore` assina isto direto.
let modo: ThemeMode = "system";
const inscritos = new Set<() => void>();

export function getMode(): ThemeMode {
  return modo;
}

export function setMode(proximo: ThemeMode): void {
  // Sem esta guarda, tocar "Escuro" já estando no escuro re-renderizaria as 9
  // telas por nada.
  if (proximo === modo) return;
  modo = proximo;
  for (const avisar of inscritos) avisar();
}

/** Na assinatura de `useSyncExternalStore`: devolve o cancelador. */
export function subscribe(avisar: () => void): () => void {
  inscritos.add(avisar);
  return () => {
    inscritos.delete(avisar);
  };
}
