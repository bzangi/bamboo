import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Geist Sans para nome e título; Geist Mono para TODO número e rótulo — dígito
// tabular é o certo numa tela de leitura de dado, e dá à página um ar de
// instrumento em vez de folheto. As duas faces já vivem no repo (nenhuma fonte
// nova baixada).
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Bamboo · visão da nutri",
  description: "Acompanhamento de pacientes: adesão e registro por ciclo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
