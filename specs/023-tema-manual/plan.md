# 023 — Plano técnico

## A pedra angular

`usePalette()` já era o **funil único** da cor no app: as 9 telas fazem
`const c = usePalette()` + `useMemo(() => makeStyles(c), [c])`. Se o override
entrar **dentro** dele e ele continuar devolvendo uma das duas identidades de
objeto de módulo, a troca manual custa **zero linha em qualquer tela** — e o
`c === palettes.dark` do `Marca.tsx` (que escolhe o `tint` do `BlurView`) segue
correto sem saber que um override existe.

Todo o resto do plano é consequência disso.

## Por que um módulo novo em vez de tudo no `theme.ts`

O Vitest do `apps/mobile` roda em `environment: "node"` **sem stub de
react-native** — decisão registrada no próprio `vitest.config.ts`. `theme.ts`
importa `react-native`, logo nada dentro dele é testável ali.

Então a lógica — a regra `isDark` e o store — vai para **`src/theme-mode.ts`,
puro, zero import de `react-native`**, e o `theme.ts` fica com o que só existe
com nativo: aplicar no sistema e gravar no disco. O corte não é estético: é a
linha entre o que dá para provar sem simulador e o que não dá.

## Store em vez de Context

O modo é UM para o app inteiro. Um `Context` obrigaria a envolver a árvore e
existir um provider; um módulo com `Set<() => void>` + `useSyncExternalStore`
(React 19, já instalado) assina direto de dentro do `usePalette()`. Menos peças,
e a assinatura de `usePalette()` não muda.

## Os arquivos

| Arquivo                      | O quê                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/theme-mode.ts` **novo** | `ThemeMode`, `SystemScheme`, `isDark`, `parseThemeMode`, e o store (`getMode`/`setMode`/`subscribe`). Puro.                                  |
| `src/theme.ts`               | `usePalette()` cruza store × `useColorScheme()` por `isDark`. Ganha `useThemeMode()`, `applyThemeMode()` e `loadThemeMode()`.                |
| `src/Aparencia.tsx` **novo** | `BotaoAparencia`: o glifo, o `useState` da folha e a `Folha` com as 3 linhas.                                                                |
| `src/Marca.tsx`              | Renderiza `<BotaoAparencia />` no fim da barra, **fora do `vao`** — o vão é a dança nome↔pílula da rolagem, e o controle não participa dela. |
| `App.tsx`                    | `loadThemeMode()` uma vez no boot; `StatusBar` deriva da paleta.                                                                             |

## Decisões pontuais

**D1 — `'unspecified'`, não `null`.** `ColorSchemeName` na RN 0.85.3 é
`'light' | 'dark' | 'unspecified'`. O sentinela de "volta pro sistema" em
`Appearance.setColorScheme` é **`'unspecified'`** — o próprio `Appearance.js` faz
caso especial dele. E `useColorScheme()` **também pode devolvê-lo**: foi o `tsc`
que apontou, contra um tipo meu que só previa `null`. Virou caso de teste.

**D2 — validar o que vem do disco.** `parseThemeMode` casa contra os três
literais e devolve `null` para o resto. Um `as ThemeMode` faria disco corrompido,
ou gravado por uma versão antiga, virar modo inválido em silêncio.

**D3 — guarda de igualdade no `setMode`.** Tocar "Escuro" já estando no escuro
não avisa ninguém: sem isso, re-renderizaria as 9 telas por nada.

**D4 — o glifo é fixo (`◐`), não indica o modo.** Quem diz qual está valendo é o
`✓` da folha. Um ícone sol/lua **mentiria** no automático — não há símbolo que
diga "escuro PORQUE o telefone está escuro". `◐` é texto, não emoji, então herda
a cor da tinta nos dois modos, e não custa uma biblioteca de ícones (o
`Marca.tsx` já desenha o colmo com três `View` justamente para não trazer
`react-native-svg`).

**D5 — o controle é auto-contido.** O `visible` da folha não tem relação com nada
mais na `HomeScreen`, então não sobe. Resultado: `HomeScreen.tsx` com diff vazio.

**D6 — a dependência.** `@react-native-async-storage/async-storage`, instalada
por `npx expo install` (que resolve a versão que o SDK espera: 2.2.0).
Confirmado nos docs versionados do **SDK v56** que é suportado e roda no Expo Go
— o `AGENTS.md` do app exige ler a doc versionada antes de escrever código.

## Estratégia de teste

- **`theme-mode.test.ts`** (node, sem nativo): `isDark` nos modos × sistema
  claro/escuro/`null`/`undefined`/`'unspecified'`; `parseThemeMode` aceitando os
  três e recusando `null`/`""`/`"Dark"`/`"escuro"`; o store (default, avisa,
  não-avisa-se-igual, cancela inscrição).
- **Bundle real**: `expo export --platform ios` + `grep` no bytecode Hermes,
  mesmo método da 019. Prova que compila com a dependência nova e que os módulos
  entraram. (Não-ASCII fica em **UTF-16LE** no bytecode — `grep` de UTF-8 não
  acha, e isso não é módulo faltando.)
- **Componente RN não é testado**: não há harness de componente no app (decisão
  registrada desde a 005). O que sobra é julgamento visual, e vai para o smoke
  manual do dono.

## Riscos

- **Não verificável por mim:** se `Appearance.setColorScheme` propaga no aparelho.
  Mitigado por desenho — é auxiliar, a paleta vem do store (ver resíduo na spec).
- **Expo Go vs. dev client:** Expo Go traz o AsyncStorage; um dev client
  compilado ANTES desta instalação precisa ser reconstruído.
