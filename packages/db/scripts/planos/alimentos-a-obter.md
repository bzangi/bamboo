# Alimentos do plano real que a base não tem

**Contexto:** a base de alimentos é TACO pura (582 itens, todos com `taco_id`) — não tem
industrializado nem receita. Estes 23 itens aparecem no plano do Bruno (24/07/2026) e não existem
em `food`. Como `food.kcal/carb/protein/fat` são `NOT NULL`, **nenhum deles pode ser inserido sem
os números** — e chutar composição em dado de saúde não é opção.

**Impacto medido:** 26 das 30 opções do plano têm ao menos um item desta lista. As 4 que não têm
são almoço **Padrão** e **Escondidinho fit**, nos dois tipos-de-dia.

Fonte da lista: gerada de [`bruno-2026-07.ts`](./bruno-2026-07.ts) (campo `falta`), para não
divergir da transcrição.

## O que anotar

Por item, **por 100 g**: `kcal · carboidrato (g) · proteína (g) · gordura (g)`. Fibra é opcional.

> Rótulo brasileiro costuma vir **por porção** (ex.: "porção de 30 g"). Se for o caso, anote a
> porção junto e a conversão é minha — não precisa fazer conta no mercado.

Preencha na tabela do fim; a coluna "medida da nutri" já está resolvida (saiu do próprio plano),
não precisa medir nada.

## Rótulos — usados direto no plano (12)

- [ ] **Pão australiano Wickbold** · 1 fatia = 33 g · _4 opções_ (pré-treino, café da manhã, lanche)
- [ ] **Rap10 original** · 1 unidade = 40 g · _4 opções_ (lanche e jantar dos dois dias)
- [ ] **Queijo provolone** · 1 fatia média = 15 g · _4 opções_ (macarrão do almoço e do jantar)
- [ ] **Creme de ricota Light** · 1 colher de sopa = 20 g · _3 opções_ (rap 10)
- [ ] **Sonho de valsa (bombom)** · 1 unidade = 20 g · _2 opções_ (sobremesa dos dois dias)
- [ ] **Pão de hambúrguer (Pullman)** · 1 unidade = 50 g · _2 opções_ (hambúrguer caseiro)
- [ ] **Batata palito congelada (Bem Brasil)** · _2 opções_ (hambúrguer caseiro)
- [ ] **YoPRO 15 g High Protein Morango** · 1 potinho = 160 g · _2 opções_ (lanche iogurte)
- [ ] **Marmita Liv Up** · 1 marmita = 370 g · _1 opção_ (jantar)
- [ ] **Leite de vaca UHT semidesnatado** · _1 opção_ (café da manhã sanduíche)
- [ ] **Iogurte grego baunilha (Vigor)** · _1 opção_ (café da manhã iogurte)
- [ ] **Sucrilhos (Kelloggs)** · 1 colher de sopa cheia = 5 g · _1 opção_ (café da manhã iogurte)

## Rótulos — só como alternativa de substituição (6)

Não travam nenhuma opção; sem eles a alternativa simplesmente não aparece na troca.

- [ ] **Filé mignon grelhado** · 1 bife pequeno = 50 g
- [ ] **Geleia de morango (Ritter)** · 1 colher de sopa rasa = 22 g
- [ ] **Azeite** — a TACO desta base não tem óleo de oliva
- [ ] **Yopro bebida proteica 15 g** · 1 embalagem = 250 g
- [ ] **Barrinha de proteína Bombom Crocante (Bold)** · 1 unidade = 60 g
- [ ] **Iogurte proteico Verde Campo** · 1 garrafinha = 250 g

## Receitas — rótulo não resolve (5)

Aqui preciso dos **ingredientes e quantidades** (o que sua nutri usou pra calcular), ou o print da
composição que o software dela mostra para o item.

- [ ] **Strogonoff `fit`** · 250 g por porção · _2 opções de almoço_
- [ ] **Patê de frango** · 1 colher de sopa = 25 g · _2 opções de lanche_
- [ ] **Panqueca de banana** · 1 porção = 152 g · _2 opções de lanche_
- [ ] **Pizza de frigideira** · 1 porção = 185 g · _2 opções de lanche_
- [ ] **Miolo de alcatra (baby beef) com molho roti** · só como substituição

## Dois casos para perguntar à nutri (não são desta lista)

1. **Macarrão cozido** — a base só tem `Macarrão de trigo (cru)`. Cru e cozido têm kcal/100 g bem
   diferentes (a massa absorve água), então usar o cru inflaria o alvo. Vale confirmar se ela
   calculou sobre o cru ou o cozido.
2. **Milho verde cozido** — a base só tem cru. Mesma pergunta.

E uma observação sobre o plano em si: o de **fim de semana não tem pré-treino nem café da manhã**,
mas a lista de compras dele inclui café, leite, sucrilhos e geleia — pode ser intencional (o dia
começa no almoço) ou export parcial do software.

## Tabela para preencher

Cole os números aqui e eu carrego. `source` fica `rotulo` ou `receita` (não `taco`).

| alimento                        | kcal/100g | carb/100g | prot/100g | gord/100g | fibra/100g | sodio/100g (em mg) |
| ------------------------------- | --------: | --------: | --------: | --------: | ---------: | -----------------: |
| Pão australiano Wickbold        |       262 |        46 |        13 |       2,9 |          7 |                227 |
| Rap10 original                  |       253 |        52 |       7,1 |       2,1 |        9,5 |                431 |
| Queijo provolone                |       351 |       2,1 |      25,6 |      27,5 |          0 |                876 |
| Creme de ricota Light           |       130 |       4,0 |       8,0 |       9,0 |          0 |                400 |
| Sonho de valsa                  |       520 |        56 |       7,5 |        29 |        2,5 |                 80 |
| Pão de hambúrguer Pullman       |       280 |        53 |       9,0 |       4,0 |        2,5 |                430 |
| Batata palito Bem Brasil        |       140 |        22 |       2,5 |       5,0 |        2,5 |                 80 |
| YoPRO 15g Morango               |        53 |       3,5 |       9,5 |         0 |          0 |                 28 |
| Marmita Liv Up                  |       130 |        12 |        10 |       5,5 |        2,5 |                350 |
| Leite UHT semidesnatado         |        46 |       4,7 |       3,1 |       1,6 |          0 |                 43 |
| Iogurte grego baunilha Vigor    |       115 |        15 |       4,0 |       4,0 |          0 |                 65 |
| Sucrilhos Kelloggs              |       380 |        88 |       4,0 |       0,5 |        3,0 |                600 |
| Filé mignon grelhado            |       220 |         0 |        31 |       9,5 |          0 |                 55 |
| Geleia de morango Ritter        |       250 |        62 |       0,5 |         0 |        1,5 |                 20 |
| Azeite                          |       884 |         0 |         0 |       100 |          0 |                  0 |
| YoPRO bebida 250ml              |        66 |       4,1 |        10 |       1,0 |          0 |                 62 |
| Barrinha BOLD — Bombom Crocante |       385 |        35 |        35 |        14 |        7,5 |                180 |
| Iogurte Verde Campo             |        70 |       5,5 |       4,5 |       3,0 |          0 |                 55 |
| Strogonoff fit                  |        98 |       1,6 |      17,4 |       1,9 |        0,3 |                171 |
| Patê de frango                  |       170 |         3 |        20 |         8 |          0 |                400 |
| Panqueca de banana              |       170 |        20 |         8 |         6 |        2,5 |                100 |
| Pizza de frigideira             |       157 |      22,4 |      16,7 |       5,1 |        0,8 |                251 |
| Baby beef grelhado              |       220 |         0 |        29 |        11 |          0 |                 55 |
