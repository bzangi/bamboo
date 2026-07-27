import * as React from "react";
import { cn } from "@/lib/utils";

// O wrapper com `overflow-x-auto` é do próprio shadcn e não é decoração: sem ele
// uma tabela larga empurra o scroll horizontal para o BODY, e a página inteira
// desliza de lado no celular.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      // O `transition-colors` estava aqui sem nada para transicionar. Agora tem:
      // a linha responde ao ponteiro, que é o que faz uma lista longa navegável.
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/50",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        // `first:pl-5 last:pr-5`: alinha a 1ª e a última coluna com o padding do
        // Card que envolve a tabela, sem tirar o full-bleed das linhas.
        "h-10 px-3 first:pl-5 last:pr-5 text-left align-middle font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-subtle",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-3 first:pl-5 last:pr-5 align-middle", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
