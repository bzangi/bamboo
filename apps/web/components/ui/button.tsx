import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui `button`, com duas diferenças deliberadas (plan.md/D10):
//  · sem `asChild`/`@radix-ui/react-slot` — nada aqui precisa trocar o elemento
//    raiz, e o Slot custaria uma dependência e um componente client;
//  · as cores vêm dos tokens da 015 (`--feito` etc.), não da paleta neutra
//    padrão do shadcn.
// Resultado: componente de servidor puro, sem "use client".

// Cantos em pílula e o afundar de 1px no toque: é o idioma de controle do
// iOS 26/Tahoe. O botão responde ao dedo em vez de só trocar de cor.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,color,border-color,translate] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-1)] hover:bg-primary/90",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "border border-destructive/40 text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3.5 text-xs",
        xs: "h-7 px-3 text-xs",
        /** Quadrado, para o botão que é SÓ um ícone (a lixeirinha do editor). */
        icone: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
