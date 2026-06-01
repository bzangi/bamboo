# Research — Motor de rebalanceamento (Fase 2)

Decisões técnicas que resolvem as áreas em aberto da spec, no formato Decisão / Rationale / Alternativas. Todas respeitam a Constituição (núcleo puro, `Result`, sem `throw`, `ts-pattern`).

---

## D1 — Um motor só: primitivo `rebalancearPorKcal` + adaptadores por gatilho

**Decisão**: o coração é **um** primitivo puro que recebe as **alavancas** (itens flexíveis das refeições ajustáveis) e um **`deltaKcal`** (quanto de energia o resto do dia precisa absorver) e devolve as alavancas reescaladas — ou uma recusa. Cada gatilho é um **adaptador fino** que calcula o `deltaKcal` e o conjunto de alavancas:

- **P1 (opção desigual)**: `deltaKcal = totalDiaComEscolha.kcal − alvoDia.kcal`; alavancas = itens flexíveis de refeições com `position` > a do gatilho.
- **P3 (troca de tipo-de-dia)**: `deltaKcal = (consumido + restantePlanejadoDoNovoTipo).kcal − alvoNovoTipo.kcal`; alavancas = itens flexíveis das refeições restantes do novo tipo-de-dia.

**Rationale**: materializa a tese "um motor só, vários gatilhos". P1 e P3 reduzem ao mesmo cálculo (absorver um delta de energia respeitando o piso); a diferença é só de onde vem o delta. Testa-se o primitivo exaustivamente e os adaptadores ficam triviais.

**Alternativas**: dois motores separados (duplicação, diverge com o tempo); um motor que recebe o "dia inteiro" e infere o gatilho (acopla o núcleo a estrutura de transporte — pior pra testar).

---

## D2 — Ação ancorada em kcal; faixa avaliada por nutriente

**Decisão**: escalar a quantidade (gramas) de um alimento mexe em **todos** os macros juntos — não dá pra cravar carb+proteína+gordura independentemente reescalando poucos itens (sistema sobredeterminado, FR-010). Então: a **decisão de agir** usa a faixa **por nutriente** (se todos os nutrientes ficam dentro de `alvo ± tolerância`, não faz nada); a **correção** é **ancorada em kcal** — reescala as alavancas pra zerar o desvio de kcal do dia. Os demais macros caem onde caírem e a prévia os reporta.

**Rationale**: honra FR-002 (faixa por nutriente pra decidir) + FR-010 (prioriza kcal na ação). É determinístico, O(n), e a kcal é o agregado que o paciente entende como "comi demais/de menos".

**Alternativas**: otimização multi-objetivo ponderada (mínimos quadrados sujeitos ao piso) — resolve melhor os macros mas exige solver iterativo, é caixa-preta pro paciente e over-engineering pro MVP. Fica como evolução futura (ponderar quais alavancas favorecer pra também ajudar um macro específico).

---

## D3 — Distribuição proporcional à contribuição de kcal da alavanca

**Decisão**: o `deltaKcal` é distribuído entre as alavancas **proporcionalmente à kcal que cada uma contribui** (alavanca que pesa mais no dia cede/ganha mais). Redução é limitada pelo **piso** (`gramasPlanejado × pisoPct/100`); o que uma alavanca não consegue ceder (bateu o piso) **transborda** pras demais, em passes, até absorver tudo ou esgotar a folga.

**Rationale**: evita que um único item balão; mantém as proporções da refeição; é estável e previsível. O transbordo é o que faz a recusa (D4) acontecer só quando **todas** as alavancas chegam ao piso.

**Alternativas**: distribuição igual por item (distorce refeições desbalanceadas); mexer numa alavanca só (vira corte feio num prato).

---

## D4 — Recusa orientada é um **outcome `ok`**, não um erro HTTP

**Decisão**: o resultado do motor é `Result<RebalanceOutcome, RebalanceError>`, onde `RebalanceOutcome` é uma **discriminated union de desfechos de produto**: `sem-acao` | `rebalanceado` | `recusa-orientada`. A recusa ("estoura piso" / "sem alavanca") é um desfecho **válido** (`ok`), não um `err`. O `err` fica reservado a entrada estruturalmente inválida (guarda mínima; o grosso é barrado no DTO).

**Rationale**: a assinatura do produto é **"nunca barra"** (Princípio II). Recusar e orientar ("hoje ficou acima, segue leve") é conselho, não erro 4xx. Modelar como `ok` faz a casca devolver **200** com o desfecho — sem `HttpException`. Contrasta de propósito com `substituir()`, cujos `fora-do-grupo`/`nutriente-base-zero` são guardas de domínio mapeados pra 422 (entrada que a UI não deveria permitir).

**Alternativas**: `err({kind:'nao-cabe'})` mapeado pra 422 — empurra um desfecho normal pro canal de erro e dá cheiro de "barrou".

---

## D5 — Parâmetros (faixa, piso) em 3 níveis: colunas nullable + resolução pura

**Decisão**:
- **Defaults do sistema** (nível 3) = constantes no núcleo: `toleranciaPct = 10`, `pisoPct = 50`.
- **Default da nutri** (nível 2) e **override do paciente** (nível 1) = **colunas nullable** em `nutritionist` e `patient` (config), semeadas no v0 (UI da nutri fora de escopo).
- A **resolução** (`paciente ?? nutri ?? sistema`, por campo) é uma **função pura** no núcleo; a casca só lê as colunas e passa os valores.

**Rationale**: é a única forma de honrar FR-012a–c (3 níveis) sem UI da nutri. Colunas nullable são acréscimo mínimo, FK-free, idempotente na migração; "null" = "cai pro próximo nível". Mantém o núcleo puro: ele recebe os candidatos e resolve, sem saber de DB.

**Alternativas**: tabela de settings dedicada (over-engineering pra 2 campos × 2 níveis); JSON `settings` (perde tipagem/constraint, ganho zero no v0).

---

## D6 — Tolerância única (%) aplicada por nutriente

**Decisão**: um único `toleranciaPct` é aplicado a **cada** nutriente (`alvoNutriente ± toleranciaPct%`), gerando uma faixa por nutriente. Não há tolerância distinta por macro no v0.

**Rationale**: FR-002 pede "faixa por nutriente"; uma % uniforme já entrega isso, com um parâmetro só pra configurar nos 3 níveis. Como a ação é ancorada em kcal (D2), a faixa por-macro serve só pra decidir "precisa agir?".

**Alternativas**: tolerância por macro (4 valores × 2 níveis) — explode a config e a UI futura sem ganho no MVP. Fica como evolução.

---

## D7 — Combinação (1→2) reusa a matemática de substituição

**Decisão**: `combinar()` é prima de `substituir()`. Preserva o nutriente-base do grupo: divide o nutriente-base total do item original por um split `r`/`1−r` e, pra cada alvo, calcula `gramas = (baseTotal × fração) / (basisPer100g(alvo)/100)` — exatamente a conta de `substituir()` aplicada duas vezes. Reusa `basisPer100g()` e `medidaMaisProxima()` já existentes em `substitution.ts`. Exclui alvo com `basisPer100g ≤ 0` (FR-017). Erros: `fora-do-grupo`, `alvo-sem-nutriente-base` (por alvo).

**Rationale**: zero matemática nova; consistente com a Fase 1 (mesma régua de ≤2%). Não dispara rebalanceamento multi-refeição (FR-018) — vive dentro da refeição.

**Alternativas**: reimplementar a conta (duplicação). Generalizar 1→N agora (fora de escopo, FR-013).

---

## D8 — Extensão do `GET /today` em vez de endpoint novo pro "ver opções"

**Decisão**: estender o `MealDto` do `/today` pra trazer **todas** as opções (`options: MealOptionDto[]`, com a default marcada), mantendo `currentMealId`. Adiciona um query param **opcional** `?dayTypeId=<id>` pra **exibir** um tipo-de-dia diferente do default (re-ancorando "o agora") — o lado display-only da troca de tipo-de-dia no v0 (FR-021). É acréscimo retrocompatível (mobile da Fase 1 só lê campos novos quando precisa).

**Rationale**: o app já carrega o dia inteiro no `/today`; expor as opções ali evita um round-trip e um endpoint a mais. O override por query reaproveita toda a resolução de "o agora".

**Alternativas**: `GET /meals/:id/options` (round-trip extra); endpoint dedicado de troca de tipo-de-dia (sem consumidor no v0, já que não rebalanceia no app).

---

## D9 — Endpoints de prévia são POST sem persistência

**Decisão**: a prévia de P1 (`POST /patients/:id/rebalance/option-choice`) e a combinação (`POST /meal-items/:id/combine`) são **POST que calculam e devolvem** o resultado, **sem gravar nada**. O corpo carrega o gatilho; a resposta respeita o gate de exposição. Nenhuma tabela de escolha/seleção é criada (FR-026).

**Rationale**: a escolha é efêmera (estado local no app). POST (não GET) porque a entrada é estruturada (opção escolhida, dois alvos + split) e não cabe bem em query; e a semântica é "computa esta prévia", não "leia um recurso". Idempotente, sem efeito colateral.

**Alternativas**: persistir a escolha (puxa `day_selection`/registro, fora de escopo); GET com query gigante (frágil).

---

## D10 — Sem novas libs; Vitest test-first

**Decisão**: tudo em **TS puro** no núcleo, `Result` à mão + `ts-pattern` (já no projeto). **Sem** `neverthrow`/`Effect`/`fp-ts`/solver numérico. Reusa `nutrition.ts` (`nutrientesDaPorcao`) e `substitution.ts`. Testes **antes** da implementação (Vitest no `packages/core`); endpoints validados por e2e como na Fase 1.

**Rationale**: Princípio VI (escopo enxuto) e a régua da Fase 1. O cálculo é fechado e determinístico — não precisa de solver.

**Alternativas**: lib de otimização (peso/curva desnecessários no MVP).

---

## Decisões do gate (resolvidas pelo dono do produto)

1. **Sem teto de aumento** (D3): não há parâmetro de teto. O "teto" é o próprio **saldo** de macros/kcal do dia — a correção mira exatamente o desvio (não passa do alvo), então a distribuição proporcional não dá overshoot. Mantém D3 como está.
2. **Distribuição proporcional à kcal** confirmada (D3).
3. **Motor escolher/trocar alimentos do cardápio pra rebalancear → adiado (backlog).** O v0 fica no **cálculo fechado e determinístico** (reescala quantidade dos itens flexíveis, D2/D3). Dar ao motor a liberdade de escolher outros alimentos (troca dentro do grupo como alavanca, ou busca cruzando grupos) é **improvement futuro** — vira busca combinatória e/ou fura a marcação de flexibilidade da nutri. Registrado no board (EP-4 Rebalanceamento, prioridade Baixa).
