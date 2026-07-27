import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** O `cn` do shadcn: junta classes e resolve conflito de utilities do Tailwind
 *  (a última ganha), o que `clsx` sozinho não faz. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
