// Plano real do paciente 0 (Bruno Zangirolami), prescrito em 24/07/2026.
// TRANSCRIÇÃO dos dois PDFs da nutri — dado, não código: nenhuma gramatura aqui
// foi calculada por mim, todas estão escritas no plano.
//
// POR QUE EXISTE: substituir o `seed.ts` (plano fictício) pelo plano de verdade.
// Este arquivo é a fonte; o script de carga é mecânico sobre ele.
//
// ═══════════ O ACHADO ═══════════
// O PDF não é só o plano. As substituições que a nutri lançou SÃO a tabela de
// equivalência dela, e as medidas caseiras vêm calibradas em cada linha
// ("6 colher(es) de sopa cheia(s) (150g)" ⇒ 25 g/colher). As duas coisas que o
// schema precisa e que a TACO não tem — `food_household_measure.grams` e
// `food_substitution_group.reference_portion_grams` — saem daqui por leitura,
// sem inventar nada.
//
// Conferência das razões (é o que prova que ela usa proporção fixa, não número
// solto): nos dois tipos-de-dia, mandioquinha/arroz = 1,4 · batata inglesa/arroz
// = 2,4 · milho/arroz = 0,96 · contrafilé/frango = 0,8 · lombo/frango = 0,9.
// Idênticas nos dois dias, com bases diferentes (125 g e 150 g de arroz).
//
// ⚠️ DUAS INCONSISTÊNCIAS DA FONTE, não corrigidas aqui (decisão da nutri):
//  1. "Miolo de alcatra sem gordura, 1.2 bife(s) médio(s)" aparece como 115,4 g
//     (⇒ 96,2 g/bife) numa página e 120 g (⇒ 100 g/bife) em outra.
//  2. "Contrafilé, 3 bife(s) pequeno(s)" aparece como 120 g no escondidinho e
//     "3.6 bife(s) pequeno(s) (144 g)" no macarrão do MESMO dia — mesma origem
//     (patinho 150 g), destinos diferentes.
// O motor do Bamboo deriva UM número por par (preserva o nutriente-base do
// grupo), então ele nunca reproduzirá as duas versões. Ver NOTA-1 no fim.

/* ═══════════ alimentos: o que já existe na base vs. o que falta ═══════════ */

export type AlimentoDoPlano = {
  /** Nome exato como a nutri escreveu. */
  readonly plano: string;
  /** Nome na tabela `food` (base atual, 582 itens TACO). `null` = NÃO EXISTE. */
  readonly base: string | null;
  /** Medidas caseiras lidas do plano (label → gramas por unidade). */
  readonly medidas?: ReadonlyArray<{
    readonly label: string;
    readonly grams: number;
  }>;
  /** Grupo de substituição (taxonomia dos 7 grupos, `packages/db/src/groups.ts`). */
  readonly grupo?: string;
  /** Porção equivalente DELA dentro do grupo — vira reference_portion_grams. */
  readonly porcaoEquivalente?: number;
  /** Por que falta: rótulo de industrializado ou receita caseira. */
  readonly falta?: "rotulo" | "receita";
  /** Composição por 100 g, obrigatória em todo item com `falta` — o Bruno leu do
   *  rótulo / do software da nutri em 2026-07-27. `food.kcal/carb/protein/fat`
   *  são NOT NULL, então sem isto o alimento não entra na base.
   *  ⚠️ Sódio veio na coleta e NÃO é carregado: `food` não tem a coluna, e
   *  inventar coluna que ninguém lê é YAGNI. Fica na planilha. */
  readonly macros?: {
    readonly kcal: number;
    readonly carb: number;
    readonly protein: number;
    readonly fat: number;
    readonly fiber: number;
  };
};

export const ALIMENTOS: ReadonlyArray<AlimentoDoPlano> = [
  /* ---- amidos e cereais (base da equivalência: arroz = 100) ---- */
  {
    plano: "Arroz branco cozido",
    base: "Arroz branco cozido",
    medidas: [{ label: "colher de sopa cheia", grams: 25 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 100,
  },
  {
    plano: "Batata baroa (mandioquinha, batata salsa, cenoura amarela) cozida",
    base: "Batata, baroa, cozida",
    medidas: [{ label: "colher de arroz rasa", grams: 35 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 140,
  },
  {
    plano: "Batata inglesa cozida",
    base: "Batata inglesa cozida",
    medidas: [{ label: "colher de sopa cheia", grams: 30 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 240,
  },
  {
    plano: "Milho verde cozido",
    base: "Milho, verde, cru", // ⚠️ a base tem só cru/curau; conferir com a nutri
    medidas: [{ label: "colher de sopa cheia", grams: 24 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 96,
  },
  {
    plano: "Macarrão cozido",
    base: "Macarrão de trigo (cru)", // ⚠️ cru ≠ cozido: kcal/100g diferentes
    medidas: [{ label: "colher de servir cheia", grams: 50 }],
    grupo: "Amidos e cereais",
  },
  {
    plano: "Feijão carioca cozido",
    base: "Feijão carioca cozido",
    medidas: [{ label: "concha pequena cheia", grams: 65 }],
  },

  /* ---- proteínas (base: filé de frango / patinho = 100) ---- */
  {
    plano: "Filé de frango grelhado",
    base: "Frango, peito, sem pele, grelhado",
    medidas: [{ label: "bife pequeno", grams: 50 }],
    grupo: "Proteínas",
    porcaoEquivalente: 100,
  },
  {
    plano: "Patinho refogado",
    base: "Patinho bovino grelhado",
    medidas: [{ label: "colher de sopa cheia", grams: 25 }],
    grupo: "Proteínas",
    porcaoEquivalente: 100,
  },
  {
    plano: "Frango desfiado",
    base: "Frango, peito, sem pele, cozido",
    medidas: [{ label: "colher de sopa cheia", grams: 25 }],
    grupo: "Proteínas",
    porcaoEquivalente: 100,
  },
  {
    plano: "Contrafilé sem gordura grelhado",
    base: "Carne, bovina, contra-filé, sem gordura, grelhado",
    medidas: [{ label: "bife pequeno", grams: 40 }],
    grupo: "Proteínas",
    porcaoEquivalente: 80,
  },
  {
    plano: "Lombo de porco assado",
    base: "Porco, lombo, assado",
    medidas: [{ label: "fatia pequena", grams: 45 }],
    grupo: "Proteínas",
    porcaoEquivalente: 90,
  },
  {
    plano: "Miolo de alcatra sem gordura grelhado",
    base: "Carne, bovina, miolo de alcatra, sem gordura, grelhado",
    medidas: [{ label: "bife médio", grams: 96.2 }], // ⚠️ NOTA-1 (96,2 vs 100)
    grupo: "Proteínas",
    porcaoEquivalente: 77,
  },
  {
    plano: "Filé mignon grelhado",
    base: null,
    falta: "rotulo",
    macros: { kcal: 220, carb: 0, protein: 31, fat: 9.5, fiber: 0 },
    medidas: [{ label: "bife pequeno", grams: 50 }],
    grupo: "Proteínas",
    porcaoEquivalente: 100,
  },
  {
    plano: "Miolo de alcatra (baby beef) grelhada/assada com molho roti",
    base: null,
    falta: "receita",
    macros: { kcal: 220, carb: 0, protein: 29, fat: 11, fiber: 0 },
    grupo: "Proteínas",
    porcaoEquivalente: 80,
  },
  {
    plano: "Patinho bovino cru",
    base: "Carne, bovina, patinho, sem gordura, cru",
  },
  {
    plano: "Ovo de galinha",
    base: "Ovo de galinha cozido",
    medidas: [{ label: "unidade", grams: 50 }],
    grupo: "Proteínas",
    porcaoEquivalente: 100,
  },

  /* ---- laticínios ---- */
  {
    plano: "Queijo muçarela/mussarela",
    base: "Queijo, mozarela", // grafia da TACO
    medidas: [{ label: "fatia média", grams: 20 }],
    grupo: "Laticínios",
    porcaoEquivalente: 40,
  },
  {
    plano: "Queijo minas",
    base: "Queijo, minas, frescal",
    medidas: [{ label: "fatia média", grams: 30 }],
    grupo: "Laticínios",
    porcaoEquivalente: 60,
  },
  {
    plano: "Queijo provolone",
    base: null,
    falta: "rotulo",
    macros: { kcal: 351, carb: 2.1, protein: 25.6, fat: 27.5, fiber: 0 },
    medidas: [{ label: "fatia média", grams: 15 }],
  },
  {
    plano: "Creme de ricota Light",
    base: null,
    falta: "rotulo",
    macros: { kcal: 130, carb: 4.0, protein: 8.0, fat: 9.0, fiber: 0 },
    medidas: [{ label: "colher de sopa", grams: 20 }],
  },
  {
    plano: "Leite de vaca UHT semidesnatado",
    base: null,
    falta: "rotulo",
    macros: { kcal: 46, carb: 4.7, protein: 3.1, fat: 1.6, fiber: 0 },
  },
  {
    plano: "Iogurte grego baunilha (Vigor)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 115, carb: 15, protein: 4, fat: 4, fiber: 0 },
    grupo: "Laticínios",
    porcaoEquivalente: 100,
  },

  /* ---- frutas: as porções equivalentes SÃO as do plano ---- */
  {
    plano: "Abacaxi",
    base: "Abacaxi, cru",
    medidas: [{ label: "fatia pequena", grams: 75 }],
    grupo: "Frutas",
    porcaoEquivalente: 150,
  },
  {
    plano: "Banana nanica",
    base: "Banana nanica",
    // ⚠️ o seed tem 85 g/unidade média; a nutri usa 65 g. Vence a nutri.
    medidas: [{ label: "unidade média", grams: 65 }],
    grupo: "Frutas",
    porcaoEquivalente: 65,
  },
  {
    plano: "Laranja Pera",
    base: "Laranja, pêra, crua",
    medidas: [{ label: "unidade média", grams: 140 }],
    grupo: "Frutas",
    porcaoEquivalente: 140,
  },
  {
    plano: "Maçã Fuji",
    base: "Maçã, Fuji, com casca, crua",
    medidas: [{ label: "unidade pequena", grams: 90 }],
    grupo: "Frutas",
    porcaoEquivalente: 90,
  },
  {
    plano: "Melão",
    base: "Melão, cru",
    medidas: [{ label: "fatia grande", grams: 115 }],
    grupo: "Frutas",
    porcaoEquivalente: 230,
  },
  {
    plano: "Morango",
    base: "Morango, cru",
    medidas: [{ label: "unidade", grams: 20 }],
    grupo: "Frutas",
    porcaoEquivalente: 200,
  },
  {
    plano: "Pera williams",
    base: "Pêra, Williams, crua",
    medidas: [{ label: "unidade média", grams: 110 }],
    grupo: "Frutas",
    porcaoEquivalente: 110,
  },
  {
    plano: "Tangerina Ponkã",
    base: "Tangerina, Poncã, crua",
    medidas: [{ label: "unidade média", grams: 135 }],
    grupo: "Frutas",
    porcaoEquivalente: 135,
  },
  {
    plano: "Uva Itália",
    base: "Uva, Itália, crua",
    medidas: [{ label: "unidade", grams: 8 }],
    grupo: "Frutas",
    porcaoEquivalente: 120,
  },

  /* ---- vegetais: TODOS "à vontade" (ver GAP-1) ---- */
  { plano: "Alface crespa", base: "Alface lisa crua", grupo: "Vegetais" },
  { plano: "Brócolis cozido", base: "Brócolis cozido", grupo: "Vegetais" },
  { plano: "Beterraba cozida", base: "Beterraba, cozida", grupo: "Vegetais" },
  { plano: "Cenoura crua", base: "Cenoura crua", grupo: "Vegetais" },
  { plano: "Cenoura cozida", base: "Cenoura, cozida", grupo: "Vegetais" },
  { plano: "Tomate", base: "Tomate (salada)", grupo: "Vegetais" },
  { plano: "Tomate cereja", base: "Tomate (salada)", grupo: "Vegetais" },

  /* ---- pães e cereais matinais ---- */
  {
    plano: "Pão australiano Wickbold",
    base: null,
    falta: "rotulo",
    macros: { kcal: 262, carb: 46, protein: 13, fat: 2.9, fiber: 7 },
    medidas: [{ label: "fatia", grams: 33 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 66,
  },
  {
    plano: "Pão de forma",
    base: "Pão, trigo, forma, integral", // ⚠️ a base só tem integral
    medidas: [{ label: "fatia média", grams: 25 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 50,
  },
  {
    plano: "Pão francês (Pão de sal, pão carequinha)",
    base: "Pão francês",
    medidas: [{ label: "unidade", grams: 50 }],
    grupo: "Amidos e cereais",
    porcaoEquivalente: 50,
  },
  {
    plano: "Pão de hambúrguer (Pullman)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 280, carb: 53, protein: 9.0, fat: 4.0, fiber: 2.5 },
    medidas: [{ label: "unidade", grams: 50 }],
  },
  {
    plano: "Rap10 original (Rap10)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 253, carb: 52, protein: 7.1, fat: 2.1, fiber: 9.5 },
    medidas: [{ label: "unidade", grams: 40 }],
  },
  {
    plano: "Sucrilhos (Kelloggs)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 380, carb: 88, protein: 4.0, fat: 0.5, fiber: 3.0 },
    medidas: [{ label: "colher de sopa cheia", grams: 5 }],
  },

  /* ---- açúcares (base: doce de leite 20 g) ---- */
  {
    plano: "Doce de leite cremoso",
    base: "Doce, de leite, cremoso",
    medidas: [{ label: "colher de sopa", grams: 20 }],
    grupo: "Açúcares",
    porcaoEquivalente: 20,
  },
  {
    plano: "Geleia de morango (RItter)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 250, carb: 62, protein: 0.5, fat: 0, fiber: 1.5 },
    medidas: [{ label: "colher de sopa rasa", grams: 22 }],
    grupo: "Açúcares",
    porcaoEquivalente: 22,
  },
  {
    plano: "Mel de abelha",
    base: "Mel, de abelha",
    medidas: [{ label: "colher de sopa", grams: 20 }],
    grupo: "Açúcares",
    porcaoEquivalente: 20,
  },
  {
    plano: "Sonho de valsa (bombom)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 520, carb: 56, protein: 7.5, fat: 29, fiber: 2.5 },
    medidas: [{ label: "unidade", grams: 20 }],
  },

  /* ---- bebidas e diversos ---- */
  { plano: "Café coado (suave)", base: "Café, infusão 10%" },
  {
    plano: "Molho de tomate",
    base: "Tomate, molho industrializado",
    medidas: [{ label: "concha cheia", grams: 58 }],
  },
  {
    plano: "Azeite",
    base: null,
    falta: "rotulo",
    macros: { kcal: 884, carb: 0, protein: 0, fat: 100, fiber: 0 },
  }, // a base não tem óleo de oliva
  {
    plano: "Batata palito adicional congelada (Bem Brasil)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 140, carb: 22, protein: 2.5, fat: 5.0, fiber: 2.5 },
  },
  {
    plano: "Patê de frango",
    base: null,
    falta: "receita",
    macros: { kcal: 170, carb: 3, protein: 20, fat: 8, fiber: 0 },
    medidas: [{ label: "colher de sopa", grams: 25 }],
  },

  /* ---- receitas e prontos: nada disso está na TACO ---- */
  {
    plano: "Strogonoff `fit`",
    base: null,
    falta: "receita",
    macros: { kcal: 98, carb: 1.6, protein: 17.4, fat: 1.9, fiber: 0.3 },
  },
  {
    plano: "Panqueca de banana",
    base: null,
    falta: "receita",
    macros: { kcal: 170, carb: 20, protein: 8, fat: 6, fiber: 2.5 },
    medidas: [{ label: "porção", grams: 152 }],
  },
  {
    plano: "Pizza de frigideira",
    base: null,
    falta: "receita",
    macros: { kcal: 157, carb: 22.4, protein: 16.7, fat: 5.1, fiber: 0.8 },
    medidas: [{ label: "porção", grams: 185 }],
  },
  {
    plano: "Marmita Liv Up",
    base: null,
    falta: "rotulo",
    macros: { kcal: 130, carb: 12, protein: 10, fat: 5.5, fiber: 2.5 },
    medidas: [{ label: "marmita inteira", grams: 370 }],
  },

  /* ---- proteicos industrializados (grupo próprio da nutri: 1 potinho ↔ 1 bebida ↔ 1 barrinha) ---- */
  {
    plano: "YoPRO 15g High Protein 160g Morango",
    base: null,
    falta: "rotulo",
    macros: { kcal: 53, carb: 3.5, protein: 9.5, fat: 0, fiber: 0 },
    medidas: [{ label: "potinho", grams: 160 }],
    grupo: "Laticínios",
    porcaoEquivalente: 160,
  },
  {
    plano: "Yopro - bebida proteica 15g de proteína",
    base: null,
    falta: "rotulo",
    macros: { kcal: 66, carb: 4.1, protein: 10, fat: 1.0, fiber: 0 },
    medidas: [{ label: "embalagem inteira", grams: 250 }],
    grupo: "Laticínios",
    porcaoEquivalente: 250,
  },
  {
    plano: "Barrinha de Proteína - Bombom Crocante (Marca: Bold)",
    base: null,
    falta: "rotulo",
    macros: { kcal: 385, carb: 35, protein: 35, fat: 14, fiber: 7.5 },
    medidas: [{ label: "unidade", grams: 60 }],
    grupo: "Laticínios",
    porcaoEquivalente: 60,
  },
  {
    plano: "Iogurte proteico Verde Campo",
    base: null,
    falta: "rotulo",
    macros: { kcal: 70, carb: 5.5, protein: 4.5, fat: 3.0, fiber: 0 },
    medidas: [{ label: "garrafinha", grams: 250 }],
    grupo: "Laticínios",
    porcaoEquivalente: 250,
  },
];

/* ═══════════ os dois tipos-de-dia ═══════════ */

export const TIPOS_DE_DIA = {
  /** Seg–sex (a confirmar): tem pré-treino 05:30 e café da manhã 08:30. */
  comCorrida: {
    nome: "Dias com corrida",
    refeicoes: [
      {
        position: 1,
        nome: "Pré-treino",
        horario: "05:30",
        opcoes: [
          {
            label: "Padrão",
            itens: [
              { alimento: "Pão australiano Wickbold", gramas: 33 },
              { alimento: "Doce de leite cremoso", gramas: 20 },
              { alimento: "Banana nanica", gramas: 65 },
            ],
          },
        ],
      },
      {
        position: 2,
        nome: "Café da manhã",
        horario: "08:30",
        opcoes: [
          {
            label: "Sanduíche",
            itens: [
              { alimento: "Café coado (suave)", gramas: 100 },
              { alimento: "Leite de vaca UHT semidesnatado", gramas: 100 },
              { alimento: "Pão australiano Wickbold", gramas: 66 },
              { alimento: "Ovo de galinha", gramas: 100 },
            ],
          },
          {
            label: "Iogurte",
            itens: [
              { alimento: "Iogurte grego baunilha (Vigor)", gramas: 100 },
              { alimento: "Sucrilhos (Kelloggs)", gramas: 20 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Uva Itália", gramas: 120 },
            ],
          },
        ],
      },
      {
        position: 3,
        nome: "Almoço",
        horario: "12:00",
        opcoes: [
          {
            label: "Padrão",
            itens: [
              { alimento: "Arroz branco cozido", gramas: 125 },
              { alimento: "Feijão carioca cozido", gramas: 130 },
              { alimento: "Filé de frango grelhado", gramas: 125 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
            ],
          },
          {
            label: "Escondidinho fit",
            itens: [
              { alimento: "Batata inglesa cozida", gramas: 300 },
              { alimento: "Patinho refogado", gramas: 125 },
              { alimento: "Queijo muçarela/mussarela", gramas: 30 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
            ],
          },
          {
            label: "Strogonoff fit",
            itens: [
              { alimento: "Arroz branco cozido", gramas: 125 },
              { alimento: "Strogonoff `fit`", gramas: 250 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
            ],
          },
          {
            label: "Macarrão",
            itens: [
              { alimento: "Macarrão cozido", gramas: 150 },
              { alimento: "Molho de tomate", gramas: 116 },
              { alimento: "Patinho refogado", gramas: 125 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
              { alimento: "Queijo provolone", gramas: 10 },
            ],
          },
        ],
      },
      {
        position: 4,
        nome: "Sobremesa",
        horario: "12:30",
        opcoes: [
          {
            label: "Padrão",
            itens: [{ alimento: "Sonho de valsa (bombom)", gramas: 20 }],
          },
        ],
      },
      {
        position: 5,
        nome: "Lanche da tarde",
        horario: "16:00",
        opcoes: [
          {
            label: "Sanduíche",
            itens: [
              { alimento: "Pão australiano Wickbold", gramas: 66 },
              { alimento: "Patê de frango", gramas: 75 },
              { alimento: "Abacaxi", gramas: 150 },
            ],
          },
          {
            label: "Panqueca de banana",
            itens: [
              { alimento: "Panqueca de banana", gramas: 152 },
              { alimento: "Doce de leite cremoso", gramas: 20 },
              { alimento: "Abacaxi", gramas: 150 },
            ],
          },
          {
            label: "Rap 10",
            itens: [
              { alimento: "Rap10 original (Rap10)", gramas: 40 },
              { alimento: "Frango desfiado", gramas: 75 },
              { alimento: "Creme de ricota Light", gramas: 30 },
              { alimento: "Abacaxi", gramas: 150 },
            ],
          },
          {
            label: "Pizza de frigideira",
            itens: [
              { alimento: "Pizza de frigideira", gramas: 185 },
              { alimento: "Abacaxi", gramas: 150 },
            ],
          },
          {
            label: "Iogurte",
            itens: [
              { alimento: "YoPRO 15g High Protein 160g Morango", gramas: 160 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Banana nanica", gramas: 65 },
            ],
          },
        ],
      },
      {
        position: 6,
        nome: "Jantar",
        horario: "22:00",
        opcoes: [
          {
            label: "Macarrão",
            itens: [
              { alimento: "Macarrão cozido", gramas: 150 },
              { alimento: "Molho de tomate", gramas: 116 },
              { alimento: "Patinho refogado", gramas: 125 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
              { alimento: "Queijo provolone", gramas: 10 },
            ],
          },
          {
            label: "Hambúrguer caseiro",
            itens: [
              { alimento: "Pão de hambúrguer (Pullman)", gramas: 50 },
              { alimento: "Patinho bovino cru", gramas: 150 },
              { alimento: "Queijo muçarela/mussarela", gramas: 20 },
              {
                alimento: "Batata palito adicional congelada (Bem Brasil)",
                gramas: 100,
              },
            ],
          },
          {
            label: "Rap 10",
            itens: [
              { alimento: "Rap10 original (Rap10)", gramas: 80 },
              { alimento: "Frango desfiado", gramas: 125 },
              { alimento: "Creme de ricota Light", gramas: 30 },
            ],
          },
          {
            label: "Marmita Liv Up",
            itens: [{ alimento: "Marmita Liv Up", gramas: 370 }],
          },
        ],
      },
    ],
  },

  /** Sáb–dom (a confirmar) — e SEM pré-treino e SEM café da manhã no PDF. */
  semCorrida: {
    nome: "Dias sem corrida/final de semana",
    refeicoes: [
      {
        position: 3,
        nome: "Almoço",
        horario: "12:00",
        opcoes: [
          {
            label: "Padrão",
            itens: [
              { alimento: "Arroz branco cozido", gramas: 150 },
              { alimento: "Feijão carioca cozido", gramas: 100 },
              { alimento: "Filé de frango grelhado", gramas: 150 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
            ],
          },
          {
            label: "Escondidinho fit",
            itens: [
              { alimento: "Batata inglesa cozida", gramas: 300 },
              { alimento: "Patinho refogado", gramas: 150 },
              { alimento: "Queijo muçarela/mussarela", gramas: 40 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
            ],
          },
          {
            label: "Strogonoff fit",
            itens: [
              { alimento: "Arroz branco cozido", gramas: 150 },
              { alimento: "Strogonoff `fit`", gramas: 250 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
            ],
          },
          {
            label: "Macarrão",
            itens: [
              { alimento: "Macarrão cozido", gramas: 150 },
              { alimento: "Molho de tomate", gramas: 116 },
              { alimento: "Patinho refogado", gramas: 150 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
              { alimento: "Queijo provolone", gramas: 15 },
            ],
          },
        ],
      },
      {
        position: 4,
        nome: "Sobremesa",
        horario: "12:30",
        opcoes: [
          {
            label: "Padrão",
            itens: [{ alimento: "Sonho de valsa (bombom)", gramas: 20 }],
          },
        ],
      },
      {
        position: 5,
        nome: "Lanche da tarde",
        horario: "16:00",
        opcoes: [
          {
            label: "Sanduíche",
            itens: [
              { alimento: "Pão australiano Wickbold", gramas: 66 },
              { alimento: "Patê de frango", gramas: 75 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Banana nanica", gramas: 65 },
            ],
          },
          {
            label: "Panqueca de banana",
            itens: [
              { alimento: "Panqueca de banana", gramas: 152 },
              { alimento: "Doce de leite cremoso", gramas: 20 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Banana nanica", gramas: 65 },
            ],
          },
          {
            label: "Rap 10",
            itens: [
              { alimento: "Rap10 original (Rap10)", gramas: 40 },
              { alimento: "Frango desfiado", gramas: 75 },
              { alimento: "Creme de ricota Light", gramas: 30 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Banana nanica", gramas: 65 },
            ],
          },
          {
            label: "Pizza de frigideira",
            itens: [
              { alimento: "Pizza de frigideira", gramas: 185 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Banana nanica", gramas: 65 },
            ],
          },
          {
            label: "Iogurte",
            itens: [
              { alimento: "YoPRO 15g High Protein 160g Morango", gramas: 160 },
              { alimento: "Abacaxi", gramas: 150 },
              { alimento: "Banana nanica", gramas: 65 },
              { alimento: "Uva Itália", gramas: 120 },
            ],
          },
        ],
      },
      {
        position: 6,
        nome: "Jantar",
        horario: "22:00",
        opcoes: [
          {
            label: "Macarrão",
            itens: [
              { alimento: "Macarrão cozido", gramas: 200 },
              { alimento: "Molho de tomate", gramas: 116 },
              { alimento: "Patinho refogado", gramas: 150 },
              { alimento: "Alface crespa", aVontade: true },
              { alimento: "Brócolis cozido", aVontade: true },
              { alimento: "Queijo provolone", gramas: 15 },
            ],
          },
          {
            label: "Hambúrguer caseiro",
            itens: [
              { alimento: "Pão de hambúrguer (Pullman)", gramas: 50 },
              { alimento: "Patinho bovino cru", gramas: 150 },
              { alimento: "Queijo muçarela/mussarela", gramas: 40 },
              {
                alimento: "Batata palito adicional congelada (Bem Brasil)",
                gramas: 100,
              },
            ],
          },
          {
            label: "Rap 10",
            itens: [
              { alimento: "Rap10 original (Rap10)", gramas: 80 },
              { alimento: "Frango desfiado", gramas: 125 },
              { alimento: "Queijo muçarela/mussarela", gramas: 40 },
            ],
          },
        ],
      },
    ],
  },
} as const;

/* ═══════════ o que a transcrição revelou sobre o SCHEMA ═══════════
 *
 * GAP-1 — "À VONTADE" NÃO É EXPRESSÁVEL. `meal_item.quantity_grams` é NOT NULL,
 *   e alface/brócolis (e os 5 vegetais substitutos) não têm quantidade em
 *   nenhuma refeição do plano — a nutri escreve "À vontade" e reforça em toda
 *   página que "salada, verduras e vegetais são SEMPRE à vontade". Isso não é
 *   detalhe de carga: um item sem quantidade não entra na soma de kcal (alvo do
 *   dia), não pode ser alavanca de rebalanceamento e não pode ser reescalado
 *   numa substituição (vegetal ↔ vegetal é 1:1 "à vontade", sem conta).
 *   Precisa de decisão de modelo antes da carga.
 *
 * GAP-2 — MACROS DE 20 ALIMENTOS. A base é TACO puro (582 itens, todos com
 *   `taco_id`): não tem industrializado nem receita. Faltam macros de tudo que
 *   está marcado com `falta` acima. `food.kcal/carb/protein/fat` são NOT NULL,
 *   então não há como inserir "pendente" — e chutar valor de composição em dado
 *   de saúde é o que eu não vou fazer. Sem eles, 2 de cada 3 opções do plano
 *   ficam com alvo errado, o que contamina faixa-alvo, adesão e relatório.
 *
 * NOTA-1 — SUBSTITUIÇÃO: PAR vs GRUPO. A nutri prescreve pares com gramatura
 *   pronta; o Bamboo deriva a gramatura do grupo (preserva o nutriente-base).
 *   Com `reference_portion_grams` calibrado pelas razões dela (as constantes
 *   acima), os números batem onde ela foi consistente — e divergem nos dois
 *   casos em que ela própria divergiu. É o comportamento correto do motor, mas
 *   é uma diferença visível para o paciente e merece ser combinada com ela.
 */
