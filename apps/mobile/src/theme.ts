// Bamboo — sistema visual "sumi & take" (墨と竹: tinta e bambu), lado do paciente.
//
// A MESMA paleta do apps/web (`app/globals.css`). Os dois lados do produto são
// lidos pela mesma pessoa em dias diferentes — verde é "feito" nos dois, azul é
// "troquei" nos dois. Antes desta tela existir, o app tinha 30 literais
// hexadecimais espalhados por 7 `StyleSheet.create` e nenhum modo escuro.
//
// Direção: papel washi quente + tinta quente + areia (referência
// misotone.m-hand.co.jp), com a materialidade do iOS 26/Tahoe — cantos
// contínuos generosos, superfícies em camadas, sombra difusa e quente.
//
// A trinca categórica foi validada por contraste AA nos dois modos e separa
// melhor que a anterior sob daltonismo (o pior par, verde/âmbar em protanopia,
// sai de ΔE 14.7 para 18.9 no claro e 21.6 no escuro).

import { useColorScheme } from "react-native";

export interface Palette {
  /** fundo da tela — o papel */
  readonly paper: string;
  /** cartão/folha sobre o papel */
  readonly surface: string;
  /** superfície recuada: trilho, chip, campo */
  readonly muted: string;
  /** tinta */
  readonly ink: string;
  readonly ink2: string;
  readonly ink3: string;
  /** fio de separação */
  readonly line: string;
  /** areia: o traço estrutural (colmo, nó, pegador da folha) */
  readonly sand: string;
  readonly feito: string;
  readonly troquei: string;
  readonly pulei: string;
  /** texto sobre uma superfície de cor cheia */
  readonly onColor: string;
  /** véu atrás da folha modal */
  readonly veil: string;
}

const light: Palette = {
  paper: "#f2efe6",
  surface: "#fbfaf6",
  muted: "#eae6da",
  ink: "#1e1d1a",
  ink2: "#63604f",
  ink3: "#7c7768",
  line: "#ded8c9",
  sand: "#b7af96",
  feito: "#3a6b3d",
  troquei: "#1f6cb0",
  pulei: "#9e5017",
  onColor: "#fbfaf6",
  veil: "rgba(30,29,26,0.34)",
};

const dark: Palette = {
  paper: "#14150f",
  surface: "#1c1e17",
  muted: "#262920",
  ink: "#eae7dc",
  ink2: "#a5a08e",
  ink3: "#7d7869",
  line: "#333629",
  sand: "#8f8974",
  feito: "#5fae6b",
  troquei: "#5fa3dd",
  pulei: "#dd8a3a",
  onColor: "#14150f",
  veil: "rgba(0,0,0,0.55)",
};

export const palettes = { light, dark } as const;

/** A paleta do modo do sistema. Só existem DUAS identidades de objeto possíveis,
 *  então o `useMemo(() => makeStyles(c), [c])` de cada tela acerta sempre. */
export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

/** Escala de espaço. Vale a pena ser uma escala: o app usava 14 valores ad hoc. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Cantos contínuos, no idioma do iOS 26/Tahoe. */
export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  /** folha modal — o canto grande é o que faz a folha parecer material */
  sheet: 28,
  pill: 999,
} as const;

/** Tipografia. Face do sistema de propósito: SF Pro no iOS é a voz nativa da
 *  plataforma, e é ela que faz a tela parecer parte do telefone. */
export const text = {
  /** título de tela / nome da refeição */
  title: { fontSize: 20, fontWeight: "600", letterSpacing: -0.3 },
  /** título de folha modal */
  sheetTitle: { fontSize: 19, fontWeight: "600", letterSpacing: -0.2 },
  /** corpo: nome de alimento, linha de lista */
  body: { fontSize: 16, letterSpacing: -0.1 },
  /** valor: quantidade, número */
  value: { fontSize: 15, fontWeight: "600", letterSpacing: -0.1 },
  /** apoio: nutrição, dica, horário */
  small: { fontSize: 13, letterSpacing: 0 },
  /** micro-rótulo em caixa alta — a mesma voz dos rótulos da tela da nutri */
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
} as const;

/** Sombra quente, não uma caixa cinza flutuando. */
export const shadow = {
  card: {
    shadowColor: "#3c3422",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sheet: {
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
} as const;
