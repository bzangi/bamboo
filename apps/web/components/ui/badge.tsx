import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// As variantes semânticas (`feito`, `troquei`, `pulei`) usam a paleta VALIDADA da
// 015 — não são cores novas. `neutro` é ausência de dado, e por isso não compete
// com as três reais.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutro: "border-border bg-muted text-muted-foreground",
        feito: "border-feito/30 bg-feito/10 text-feito",
        troquei: "border-troquei/30 bg-troquei/10 text-troquei",
        pulei: "border-pulei/30 bg-pulei/10 text-pulei",
        contorno: "border-border text-subtle",
      },
    },
    defaultVariants: { variant: "neutro" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
