# 023 — Troca manual de tema (claro/escuro/automático) no app do paciente

**Status:** implementada · 2026-07-27
**Escopo:** `apps/mobile`. A web da nutri fica **fora** por decisão do dono.

## Por quê

O pedido foi "tema claro e tema escuro para o mobile e para a web". O
levantamento mostrou que **os dois já tinham** os dois temas, seguindo o sistema
operacional:

- `apps/web/app/globals.css`: `:root` claro + `@media (prefers-color-scheme: dark)`,
  `color-scheme` declarado, tokens pontados no Tailwind via `@theme inline` (zero
  classe `dark:`). `nutri.module.css` é 100% `var(--…)`, então o relatório herda.
  **Zero literal hexadecimal** em CSS.
- `apps/mobile/src/theme.ts`: `palettes.light`/`palettes.dark` + `usePalette()`
  sobre `useColorScheme()`; `app.json` com `userInterfaceStyle: "automatic"`;
  `StatusBar style="auto"`; `ErrorBoundary` (componente de classe, sem hook) lê
  `Appearance.getColorScheme()`. **Zero hexadecimal fora do `theme.ts`**, e as 9
  telas consomem a paleta.

A lacuna real era outra: **não havia como a pessoa escolher**. Quem prefere
escuro de dia — ou claro de noite — dependia de ir trocar o modo do telefone
inteiro. Esta feature entrega a escolha.

## O que muda

### FR-001 — três modos

O app oferece **Automático**, **Claro** e **Escuro**. `Automático` é o default e
segue o sistema (é o comportamento de hoje, preservado). Os outros dois vencem o
sistema nos dois sentidos.

### FR-002 — onde se troca

O controle vive na **barra de vidro do topo** (`BarraMarca`) — o único cromo
permanente do app, e por isso o único lugar alcançável de qualquer ponto da tela
sem inventar uma tela de ajustes para uma opção só. O toque abre a **`Folha`**
(a folha modal que já existe) com as três linhas.

### FR-003 — a escolha sobrevive ao relançamento

Gravada em `AsyncStorage` e relida uma vez no boot. Uma **preferência** que
esquece é pior que não existir.

### FR-004 — nada de dois estados de verdade

O modo em vigor é UM para o app inteiro. Toda superfície pintada pelo React o
recebe pelo `usePalette()`, que continua sendo o funil único.

### FR-005 — a barra de status acompanha

A hora e a bateria derivam da **paleta**, não do sistema. Sem isso, quem
escolhesse escuro num telefone claro leria tinta escura sobre papel escuro.

## Critérios de aceitação

- **SC-001** — `usePalette()` continua devolvendo **uma das duas identidades de
  objeto** de módulo (`palettes.light`/`palettes.dark`). É o que faz o
  `useMemo(() => makeStyles(c), [c])` das 9 telas e o `c === palettes.dark` do
  `Marca.tsx` seguirem corretos. **Verificação: `git diff` vazio nas telas** —
  `HomeScreen`, `CombineSheet`, `SubstitutionSheet`, `MealEditScreen`,
  `UndoSwapToast`, `Folha` e `ErrorBoundary`. `RebalancePreviewSheet.tsx` aparece
  com +8/−4, mas é o **WIP que já estava na árvore** na abertura da sessão (o
  "recusa-orientada"), não desta feature.
- **SC-002** — `HomeScreen.tsx` com `git diff` **vazio**: o controle é
  auto-contido, o `visible` da folha não sobe para a tela de 1300 linhas.
- **SC-003** — a regra (`isDark`) e o store têm teste que roda em `node`, sem
  simulador e sem stub nativo.
- **SC-004** — o app **bundla** com a dependência nova, e os módulos novos estão
  no bytecode.
- **SC-005** — sem migration, sem endpoint novo, `packages/core` intocado, nada
  do plano ou do registro muda. Esta feature não toca em domínio.
- **SC-006** — `apps/web` com `git diff` **vazio**.

## Fora de escopo, por decisão

- **A web.** Escolha do dono: o automático dela já funciona, e ler `cookies()` no
  layout para guardar a escolha optaria o app inteiro fora de renderização
  estática. Se um dia quiser, o caminho está desenhado: `light-dark()` em cada
  token (o override passa a ser só `color-scheme`, sem duplicar a paleta) +
  cookie por Server Action, que preserva o **zero `"use client"`** das 015/016/017.
- **Tela de ajustes.** Teria UMA opção dentro.
- **Ícone que cicla nos três modos** sem folha: três estados num glifo é opaco —
  ninguém sabe se está em "automático escuro" ou "escuro forçado".
- **Sincronizar a preferência com a API.** É preferência de aparelho, não dado do
  paciente; e não há endpoint de preferências (nem auth real).
- **Migrar o `DayTypePicker`** (`HomeScreen.tsx:996`) para a `Folha`. Ele ainda
  duplica backdrop + cartão + pegador à mão — dívida **pré-existente** (a `Folha`
  absorveu 3 das 4 cópias), e trazê-la para cá inflaria o diff sem servir a este
  objetivo.

## Resíduos assumidos

- **Flash de 1–2 frames no boot.** `AsyncStorage` é assíncrono, então quem
  escolheu contra o sistema vê o modo do sistema por um instante. Fechar a janela
  pede uma splash screen (dependência nova) por dois frames.
- **`Appearance.setColorScheme` é auxiliar, não a verdade.** Entra por uma linha
  para alinhar o que o React não pinta (aparência do teclado nos campos de busca,
  indicador de rolagem). A leitura de `Appearance.js` mostrou que ele **não**
  emite o evento `change` por conta própria — depende do nativo re-emitir
  `appearanceChanged`. Se não propagar em algum aparelho, **nada quebra**: a
  paleta vem do store.
