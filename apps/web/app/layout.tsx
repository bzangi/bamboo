import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

// Três faces, três papéis:
// · Zen Kaku Gothic New — display. É a face da referência (misotone), tem pesos
//   leves que aguentam corpo grande sem gritar, e o nome não é coincidência: o
//   produto se chama Bamboo. Só o subset LATIN foi baixado (~9 KB por peso) —
//   a UI é pt-BR, o kana/kanji da família inteira seria 1 MB por nada.
// · Geist Sans — corpo. Já vivia no repo.
// · Geist Mono — TODO número e rótulo: dígito tabular é o certo numa tela de
//   leitura de dado, e dá à página um ar de instrumento em vez de folheto.
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
const zen = localFont({
  variable: "--font-zen",
  display: "swap",
  src: [
    { path: "./fonts/ZenKakuGothicNew-Light.woff2", weight: "300" },
    { path: "./fonts/ZenKakuGothicNew-Regular.woff2", weight: "400" },
    { path: "./fonts/ZenKakuGothicNew-Medium.woff2", weight: "500" },
  ],
});

export const metadata: Metadata = {
  title: "Bamboo · visão da nutri",
  description: "Acompanhamento de pacientes: adesão e registro por ciclo.",
};

/** A marca. O glifo é o colmo: dois nós numa haste — o mesmo dispositivo que
 *  estrutura as páginas e a lista de refeições no app do paciente. */
function Marca() {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 py-1"
      aria-label="Bamboo — início"
    >
      <svg
        width="10"
        height="22"
        viewBox="0 0 10 22"
        aria-hidden="true"
        className="overflow-visible"
      >
        <path
          d="M5 1v20"
          stroke="var(--feito)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M1.5 7.5h7M1.5 14.5h7" stroke="var(--sand)" strokeWidth="1" />
      </svg>
      <span className="font-display text-[0.9375rem] font-medium tracking-[0.18em] text-foreground uppercase">
        Bamboo
      </span>
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${zen.variable}`}
      >
        {/* Barra fina, só a marca: o caminho de volta a qualquer momento. Não
            leva rótulo de contexto — quem usa esta tela é a nutricionista, e
            dizer isso a ela na tela dela é falar sozinho. */}
        <div className="border-b border-border/70 bg-card/60">
          <div className="mx-auto flex w-full max-w-5xl items-center px-5 py-2.5">
            <Marca />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
