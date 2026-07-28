# 023 — Tasks

Ordem executada. Test-first onde havia lógica.

- [x] **T001** — Levantar o estado real antes de propor qualquer coisa.
      _Aceite:_ dizer, com prova de código, o que já existia. **Achado:** os dois
      temas já existiam nos dois apps, seguindo o OS; a lacuna era a escolha.
- [x] **T002** — Confirmar `Appearance.setColorScheme` na RN instalada e ler a
      implementação. _Aceite:_ saber se é a verdade ou auxiliar. **Achado:**
      existe na 0.85.3, mas **não emite** o evento `change` sozinho ⇒ auxiliar.
      E `ColorSchemeName` é `'light'|'dark'|'unspecified'` — não `null`.
- [x] **T003** — Instalar a dependência pela via do Expo.
      `npx expo install @react-native-async-storage/async-storage` → 2.2.0.
      _Aceite:_ suportada no SDK v56 (conferido na doc versionada, como o
      `AGENTS.md` do app exige) e lockfile só com ela + 2 transitivas.
- [x] **T004 (RED)** — `src/theme-mode.test.ts`: `isDark`, `parseThemeMode`, store.
      _Aceite:_ visto falhar por módulo inexistente antes de T005.
- [x] **T005 (GREEN)** — `src/theme-mode.ts`, puro, zero import de `react-native`.
      _Aceite:_ 10 casos verdes.
- [x] **T006** — `usePalette()` passa a cruzar store × `useColorScheme()`.
      _Aceite:_ **continua devolvendo uma das duas identidades de módulo** ⇒
      `git diff` vazio nas telas (SC-001) — verificado.
      `applyThemeMode`/`loadThemeMode`/`useThemeMode` no mesmo arquivo.
- [x] **T007** — `src/Aparencia.tsx`: glifo + `Folha` com as 3 linhas, estado
      local. _Aceite:_ `HomeScreen.tsx` com `git diff` vazio (SC-002) — verificado.
- [x] **T008** — `Marca.tsx` renderiza o botão fora do `vao`; `App.tsx` chama
      `loadThemeMode()` no boot e a `StatusBar` deriva da paleta.
- [x] **T009** — `tsc --noEmit`. **Pegou um defeito real:** `useColorScheme()`
      também devolve `'unspecified'`, que meu tipo não previa. Tipo corrigido
      (`SystemScheme`) e o valor virou caso de teste.
- [x] **T010** — Verificação: 82 testes do mobile verdes, `tsc` limpo, lint da
      raiz 0 errors, Prettier limpo nos arquivos tocados.
- [x] **T011** — Prova de bundle: `expo export --platform ios` (617 módulos) +
      `grep` no bytecode Hermes — `bamboo.themeMode`, `unspecified`, `Claro`,
      `Escuro` e `multiGet` (JS do AsyncStorage) presentes. Acentuados aparecem
      em **UTF-16LE**, que é como o Hermes guarda não-ASCII.

## Pendente — designado ao dono

- [ ] **Smoke manual no simulador** (exige julgamento visual, e quem sobe o Expo
      é o Bruno): o `◐` na barra de vidro nos dois estados dela (nome e pílula);
      a folha marcando o modo em vigor com `✓`; escolher Escuro num telefone
      claro e conferir **a hora do relógio legível**; fechar e reabrir o app para
      ver a escolha sobreviver; voltar para Automático e trocar o modo do
      telefone. Se usar **dev client** compilado antes desta instalação, precisa
      reconstruir — o Expo Go já traz o AsyncStorage.

## Nota da árvore

Durante esta feature havia **outra sessão ativa na mesma árvore**, na
`022-recalculo-pelo-consumo` (`ResumoDoDia.tsx`, `resumo-dia.ts`,
`resumo-dia.test.ts`), além do WIP em `RebalancePreviewSheet.tsx` que já estava
lá na abertura. **Nenhum arquivo em comum com esta feature.** O commit foi feito
por caminho explícito — nunca `git add -A` — e o `.specify/feature.json`, que
aponta para a 022, ficou intocado. Por isso a spec foi escrita à mão em
`specs/023-tema-manual/` em vez de por `/speckit-specify`, que reescreveria esse
ponteiro.
