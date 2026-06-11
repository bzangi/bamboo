# Research — 008-auto-classificacao

> Fase 0 do plan. Decisões D1–D9 (Decision / Rationale / Alternatives). Insumos: spec fechada (Sessões 2026-06-10), dataset TACO real (verificado ao vivo: 597 alimentos, campo `category`, 15 categorias), `ingest-taco.ts`/`seed.ts` atuais, mecânica de substituição da Fase 0/1.

## D1 — Fato verificado: a fonte TACO carrega a categoria

**Decision**: tratar `category` do dataset (`danperrout/tabelataco`, conversão fiel da TACO/NEPA) como dado de entrada da classificação, persistido em `food.taco_category` na ingestão.

**Rationale**: verificado ao vivo — 597 linhas, 15 categorias: Cereais e derivados (63) · Verduras, hortaliças e derivados (99) · Frutas e derivados (96) · Gorduras e óleos (14) · Pescados e frutos do mar (50) · Carnes e derivados (123) · Leite e derivados (24) · Bebidas (14) · Ovos e derivados (7) · Produtos açucarados (20) · Miscelâneas (9) · Outros alimentos industrializados (5) · Alimentos preparados (32) · Leguminosas e derivados (30) · Nozes e sementes (11). A taxonomia aprovada pelo dono (Q2c) é exatamente a da TACO — os nomes diferem só em redação.

**Alternatives considered**: ignorar a categoria e inferir tudo do perfil nutricional (rejeitado: joga fora o dado real e reintroduz o caso difícil "3 grupos com o mesmo nutriente-base").

## D2 — Refinamento da Q1a (⚠️ pro aval): categoria = sinal primário; heurística = guarda + fallback

**Decision**: a classificação automática decide o grupo pelo **mapeamento fixo categoria→grupo** (D4). A "heurística determinística por perfil nutricional" da spec atua como: (a) **guarda de confiança** — o alimento só é vinculado se o teor do nutriente-base do grupo for ≥ 1 g/100 g (FR-003 + limiar observável) e a porção derivada for plausível (D6); (b) **fallback** pra alimento sem `taco_category` (futuro import por IA): macro dominante por 100 g → grupo da mesma base com perfil mais próximo, sob as mesmas guardas.

**Rationale**: mais determinístico e explicável que a heurística pura ("está no grupo X porque a TACO o classifica como X" é a explicação perfeita pra nutri), e elimina o erro de encaixe na base atual. O espírito da decisão Q1a (determinístico, testável, sem custo, explicável) é preservado e reforçado. É uma mudança de mecanismo em relação à letra da spec → **decisão do dono neste gate**.

**Alternatives considered**: heurística pura pra todos (rejeitado acima); categoria sem guardas (rejeitado: vincularia bebida sem carbo a "Bebidas (carb)" e quebraria a conta de substituição — FR-003 exige a guarda).

## D3 — Granularidade dos grupos: macro-base separando amido/fruta/vegetal (decisão do dono — Sessão 2026-06-10)

**Decision**: os grupos onde a troca acontece são **~7 grupos por macro-base** (não as 13 categorias TACO 1:1): Amidos e cereais (carb) · Frutas (carb) · Vegetais (carb) · Proteínas (protein) · Laticínios (protein) · Gorduras e oleaginosas (fat) · Açúcares (carb). A **categoria TACO mapeia pro grupo** (Cereais+Leguminosas→Amidos; Carnes+Pescados+Ovos→Proteínas; Gorduras+Nozes→Gorduras e oleaginosas; etc.). Tabela completa + basis + âncoras em data-model.md.

**Rationale**: durante a implementação descobriu-se que "13 categorias = grupos" + "um grupo por alimento" **narraria a substituição** — arroz (Cereais) deixaria de trocar por batata (Verduras) e feijão (Leguminosas), contra a tese (Princípio I, flexibilidade é o produto). O dono escolheu (opção 3 da pergunta de gate) grupos por macro-base separando amido/fruta/vegetal — mais coarse que as categorias (preserva arroz↔batata↔feijão), mais finos que 3 macro-bases puras (evita arroz↔alface, embora a guarda de porção já barrasse). Bônus: a curadoria do seed (amidos/proteínas/frutas/vegetais) passa a **alinhar 100%** com o mapeamento por categoria → o gabarito (SC-002) bate ~100%, em vez de ~62% com 13 categorias.

**Alternatives considered**: 13 categorias TACO (rejeitado: narra a substituição, gabarito colapsa); 3 macro-bases puras (rejeitado: arroz↔alface, banana↔arroz sem distinção — coarse demais); manter os 4 grupos do seed sem ampliar (rejeitado: não cobre gorduras/laticínios/açúcares da base ampliada).

## D4 — Mapeamento categoria→grupo + split de "Verduras, hortaliças"

**Decision**: 11 das 15 categorias TACO mapeiam pra um dos 7 grupos (ver tabela). "Verduras, hortaliças e derivados" é a **única** categoria que mapeia pra 2 grupos — resolvida por perfil: `carb ≥ 10 g/100 g` (amiláceo) → Amidos; senão → Vegetais. As 4 categorias heterogêneas — "Bebidas", "Miscelâneas", "Alimentos preparados", "Outros alimentos industrializados" (~60 itens) — **não mapeiam** pra grupo nenhum (sem vínculo, motivo `categoria-fora-da-taxonomia`).

**Rationale**: o split de Verduras é o que separa amido (batata, mandioca) de folhoso (alface, brócolis) — exatamente como o seed já curava — e é onde a heurística por perfil (decisão Q1a) ganha o seu papel. As categorias sem-grupo são pratos mistos/bebidas sem nutriente-base coerente — o edge case da spec ("preparações ficam sem grupo, introcáveis até decisão manual", Q3a). Cobertura esperada ≥ 80% das categorias que mapeiam.

**Alternatives considered**: classificar Verduras inteira como um grupo só (rejeitado: misturaria batata com alface — troca sem sentido nutricional); mapear preparados pra um grupo "catch-all" (rejeitado: esconde o caso; sem basis coerente).

## D5 — Identidade da base ampliada: `food.taco_id` + upsert (Q2d)

**Decision**: migration 0004 adiciona `food.taco_id` (integer, unique, nullable). `ingest-taco.ts` passa a ingerir **todas** as linhas com os 4 macros completos (parse de sentinels já existente; "Tr" = 0): upsert por `taco_id`; os 23 curados ganham **backfill** de `taco_id` via o mapeamento nome→tacoId que o próprio script já tem (CURATED), preservando ids/FKs e os nomes de exibição curtos. Alimentos sem os 4 macros ficam fora e são relatados (FR-004).

**Rationale**: upsert por nome duplicaria os curados (nomes de exibição ≠ descrições do dataset). `taco_id` é a identidade estável entre execuções e versões do dataset. A allow-list curada continua existindo só como **fallback offline** (modo curado atual).

**Alternatives considered**: tabela de staging separada (rejeitado: YAGNI); normalização de nomes (rejeitado: frágil).

## D6 — Porção de referência derivada com guarda (Q3c): equivalência com a âncora do grupo

**Decision**: cada grupo canônico define uma **âncora** = gramas do nutriente-base "por troca" (data-model.md). Pros 4 grupos que já têm curadoria, a âncora é **derivada da mediana dos vínculos curados** (mediana de `reference_portion_grams × basisPer100g/100`) — a classificação fica coerente com a curadoria existente; pros grupos novos, âncora proposta na tabela (aprovada junto). Porção derivada do alimento = `âncora ÷ (basisPer100g/100)`, arredondada a 5 g. **Guarda de plausibilidade**: porção derivada fora de **[10 g, 600 g]** ⇒ "sem confiança" (sem vínculo, relatado). Guarda de basis: teor do nutriente-base **< 1 g/100 g** ⇒ idem (FR-003 + limiar observável da spec).

**Rationale**: preserva exatamente a mecânica existente (trocar = preservar o nutriente-base; a porção de referência ancora a conta — `substituir()` da Fase 1). A mediana dos curados evita inventar âncora onde já há curadoria. Os limites [10, 600] g e 1 g/100 g são os "valores fixados no plan" que a Assumption da spec exigiu — testes binários.

**Alternatives considered**: porção fixa por grupo (rejeitado no gate — Q3c); porção = 100 g universal (rejeitado: distorce a equivalência — 100 g de azeite ≠ 100 g de arroz em papel nutricional).

## D7 — Seed não-destrutivo (dependência declarada na spec)

**Decision**: refatorar `seed.ts`: (a) **grupos** = upsert por nome — os **~7 canônicos** entram aqui (basis da tabela D3/data-model), os 4 atuais absorvidos pelos equivalentes por **rename mantendo o id** (Carboidratos→Amidos e cereais, Proteínas→Proteínas, Frutas→Frutas, Vegetais→Vegetais), então `meal_item.substitution_group_id` continua válido; Laticínios/Gorduras e oleaginosas/Açúcares criados vazios; (b) **vínculos curados** = upsert por (food, group) com `origin='manual'`; (c) **fim do `DELETE FROM substitution_group`/`foodSubstitutionGroup`** — nenhuma execução de seed apaga vínculo de classificação. **Bug latente da 007 corrigido aqui**: `clearPlanTables` deleta `patient`; com a migration 0003, `cycle`/`cycle_plan_vigencia` referenciam `patient` → o seed passa a deletá-los antes (senão re-seed após abrir um ciclo viola FK).

**Rationale**: sem (c), FR-008/FR-009/SC-003 são inalcançáveis (o seed apagaria a classificação a cada re-execução). A absorção por rename preserva os planos semeados (FKs intactas) e zera duplicação de taxonomia.

**Alternatives considered**: manter seed destrutivo + reclassificar após cada seed (rejeitado: apaga correções manuais — viola FR-008); criar os canônicos ao LADO dos 4 (rejeitado: duas taxonomias, itens de plano apontando pra grupos órfãos).

## D8 — Execução: script de lote re-executável + relatório (Q2a)

**Decision**: `packages/db/scripts/classify-foods.ts` — mesma família operacional do seed/ingestão (seed-first): carrega foods (sem vínculo) + grupos + âncoras, chama o núcleo puro por alimento, insere vínculos `origin='auto'` num upsert idempotente, imprime o **relatório de cobertura** (por grupo / sem-grupo com motivo / grupos vazios / % de cobertura — SC-001/SC-007). Modo **`--validar-gabarito`** (SC-002): classifica às cegas os alimentos com vínculo `manual`, compara com a curadoria e imprime o acerto — o gatilho de reversão da vigência.

**Rationale**: FR-014-style (papel da nutri por operação interna) já é o padrão do produto; rota HTTP pra disparar lote não tem consumidor no v0 (a web futura chama quando existir). O relatório no stdout + exit code ≠ 0 se a validação reprovar dá automação honesta.

**Alternatives considered**: endpoint `/nutri` pra rodar o lote (rejeitado: YAGNI; nada consome); rodar embutido na ingestão (rejeitado: mistura responsabilidades — ingestão é dado bruto, classificação é derivação re-executável).

## D9 — O que NÃO muda (fronteiras)

**Decision**: zero mudança em `substituir()`/motor/registro/DTOs do paciente; `meal_item.substitution_group_id`/cadeados intactos; vínculos automáticos existentes nunca re-classificados por re-execução; multi-grupo fora (um grupo por alimento no v0 — a validação do troquei resolve um grupo por alimento).

**Rationale**: FR-013/FR-014/FR-015 e Assumptions da spec; o efeito visível é só cobertura (mais opções de troca) — verificado por e2e de regressão + 1 caso novo no fluxo de substituições.
