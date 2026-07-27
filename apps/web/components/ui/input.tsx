import * as React from "react";
import { cn } from "@/lib/utils";

const campo =
  "flex h-9 w-full rounded-sm border border-input bg-card px-3 py-1 text-sm text-foreground shadow-none transition-colors placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-50";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        campo,
        // Dígito tabular em campo numérico: é a mesma razão da fonte mono na
        // leitura de dado (015) — número que não dança entre renders.
        type === "number" && "font-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** `<select>` NATIVO com a cara do design system (plan.md/D10): dá type-ahead do
 *  navegador de graça, funciona sem JavaScript e dispensa o `Select` do Radix —
 *  que traria "use client" e ~6 dependências. Com ~580 alimentos, o type-ahead
 *  nativo é melhor que um combobox nosso. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(campo, "cursor-pointer", className)} {...props} />
  );
}

export { Input, Select };
