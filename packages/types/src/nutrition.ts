// DTO derivado: nutrição da porção filtrada pelo gate de exposição (montada na
// borda). Módulo neutro — evita ciclo de import entre today.ts e
// substitution.ts (010: a alternativa de troca também usa este tipo).
//  - hidden    -> o item NÃO traz nutrition (campo ausente).
//  - percent   -> só proporções dos macros (carbPct/proteinPct/fatPct), sem gramas/kcal.
//  - macros    -> gramas dos macros + proporções; sem kcal cheio.
//  - full_kcal -> tudo (kcal + macros + proporções).
// Campos opcionais para um único tipo cobrir os níveis sem união explodir no cliente.
export interface NutritionDto {
  readonly kcal?: number;
  readonly carb?: number;
  readonly protein?: number;
  readonly fat?: number;
  readonly carbPct?: number;
  readonly proteinPct?: number;
  readonly fatPct?: number;
}
