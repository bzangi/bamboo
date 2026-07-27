import * as React from "react";
import { cn } from "@/lib/utils";

// `<label>` nativo em vez de `@radix-ui/react-label`: o Radix só acrescenta um
// comportamento de clique que o `htmlFor` nativo já tem nos elementos que estas
// telas usam — e custaria um componente client.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        // Micro-rótulo em mono: mesma voz dos rótulos da tela de leitura, onde
        // rótulo é instrumento e não título.
        "font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-subtle",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
