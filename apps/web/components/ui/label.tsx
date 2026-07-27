import * as React from "react";
import { cn } from "@/lib/utils";

// `<label>` nativo em vez de `@radix-ui/react-label`: o Radix só acrescenta um
// comportamento de clique que o `htmlFor` nativo já tem nos elementos que estas
// telas usam — e custaria um componente client.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
