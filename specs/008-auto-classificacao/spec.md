# Feature Specification: Auto-classificação de alimentos em grupos de substituição

**Feature Branch**: `008-auto-classificacao`

**Created**: 2026-06-10

**Status**: Draft — **gate Specify→Plan fechado** (Sessões 2026-06-10): método A, ampliação TACO, vigência imediata, **grupos de equivalência por macro-base (amido/fruta/vegetal separados; ~7 grupos) derivados das categorias TACO**, sem-grupo no ambíguo, grupo único, porção derivada; aguardando o plan

**Input**: User description: "Pré-classificar automaticamente os alimentos da base nos grupos de substituição (por semelhança nutricional), com porção de referência derivada, para que a flexibilidade do plano escale além do vínculo manual do seed — a nutri só corrige exceções."

## Visão geral

A substituição — o coração da tese ("adaptar, não apenas mostrar") — só existe para alimentos **vinculados a um grupo de substituição com porção de referência**: o vínculo diz "estes alimentos são equivalentes entre si" e a porção de referência ancora o recálculo de quantidade na troca. Hoje esse vínculo é **100% manual**: os vínculos curados, semeados na fundação do produto. Honestidade sobre a base real: a ingestão vigente da TACO é uma **allow-list curada de 23 alimentos**, dos quais **16 já têm vínculo curado** (~70% da base operacional) — sobre ela, esta feature classificaria só os 7 restantes. A premissa de valor ("não escala") vale para a base real do produto: a TACO completa (~590 itens) e o crescimento que o import por IA da Fase 4 trará. **Escalar a cobertura pressupõe ampliar a ingestão da TACO além da allow-list — decidido no gate: a ampliação FAZ PARTE desta feature (Q2d, Sessão 2026-06-10).** Todo alimento sem vínculo é, na prática, **introcável** — e cada plano novo exigiria trabalho manual de vínculo, o que não escala para uma nutri real.

Esta feature implementa a decisão de produto **"sem enlouquecer"**: o sistema **pré-classifica** cada alimento da base no seu grupo de substituição automaticamente (viável por semelhança nutricional), e a nutri **só mexe nas exceções** _(decisoes-produto.md:89)_. O modelo permanece o **Modelo 1 — lista de substituição/equivalência**, o que a nutri já usa há décadas, com zero curva de aprendizado _(decisoes-produto.md:88)_.

Fronteira essencial: a feature **alimenta** a mecânica existente — grupos com nutriente-base e vínculo alimento↔grupo com porção de referência, em vigor desde a Fase 0/1 — **sem mudá-la**. Nenhuma conta de substituição, equivalência ou rebalanceamento é alterada; o que muda é a **cobertura**: mais alimentos vinculados → mais opções de troca disponíveis, inclusive nos itens flexíveis de planos que já apontam para esses grupos.

A pré-classificação **não é palavra final**: é palpite do sistema, identificado como tal, e a correção humana (a nutri — ou o operador no papel dela, seed-first) **sempre vence** e nunca é sobrescrita por re-execução. Isso deriva da etapa de confirmação clínica obrigatória da nutri _(decisoes-produto.md:85)_ e do Princípio V (dado/plano de saúde).

### Clarifications

#### Sessão 2026-06-10 (gate Specify→Plan — respostas parciais do dono)

- **Q1a — Método** → **A: heurística determinística por perfil nutricional** (macro dominante por 100 g + proximidade ao perfil do grupo) — testável, explicável pra nutri, sem custo por execução; IA/LLM fica deferida pro import da Fase 4. _(Encodada no FR-001.)_
- **Q2d — Base** → **ampliação da ingestão TACO incluída nesta feature** (allow-list de 23 → base completa, ~590) — é o que dá valor real à classificação. _(Encodada no FR-006.)_ Q2a (lote) e Q2b (só grupos do sistema) eram recomendações e não foram contestadas — adotadas como default vetável.
- **Q1b — Vigência** → **vale imediatamente**: o vínculo automático vira opção de troca pro paciente sem revisão prévia. Desvio consciente do espírito do Princípio V (decisoes-produto.md:85), registrado nesta aprovação; **gatilho de reversão armado pelo SC-002** (validação às cegas reprovando → muda pra revisão prévia). _(Encodada no FR-001.)_
- **Q2c — Taxonomia canônica** → **grupos de equivalência por macro-base, separando amido/fruta/vegetal** (decisão refinada no gate do plan, Sessão 2026-06-10): os grupos onde a troca acontece são **~7 grupos** mais coarse que as 13 categorias TACO (que narrariam demais a substituição — arroz deixaria de trocar por batata/feijão, contra a tese), mas mais finos que as 3 macro-bases (que permitiriam arroz↔alface). Conjunto: **Amidos e cereais** (carb) · **Frutas** (carb) · **Vegetais** (carb) · **Proteínas** (protein) · **Laticínios** (protein) · **Gorduras e oleaginosas** (fat) · **Açúcares** (carb). A **categoria TACO mapeia pro grupo** (ex.: Cereais+Leguminosas→Amidos; Carnes+Pescados+Ovos→Proteínas); "Verduras, hortaliças" **divide por perfil** (amiláceos com carb ≥ 10 g/100 g → Amidos; folhosos → Vegetais). Os 4 grupos do seed (Carboidratos/Proteínas/Frutas/Vegetais) absorvem-se em Amidos/Proteínas/Frutas/Vegetais (ids/FKs preservados); Laticínios/Gorduras/Açúcares são novos. _(Encodada no FR-006; tabela completa + basis no plan/data-model.)_
- **Q3 — Ambiguidade/confiança** → **(a)** alimento sem encaixe confiável fica **sem grupo** por default (introcável, relatado na cobertura), **podendo ser adicionado a grupos pela nutricionista** (correção manual — US2/FR-008); **(b)** **um único grupo** por vínculo automático; **(c)** porção de referência **derivada da equivalência com guarda de plausibilidade** (fora da guarda → sem confiança, relatado). _(Encodadas no FR-005.)_

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A base pré-classificada destrava a troca (Priority: P1)

Os alimentos da base que hoje não pertencem a grupo nenhum são classificados automaticamente, por semelhança nutricional, nos grupos de substituição — cada um com uma porção de referência válida. O efeito visível: itens flexíveis que apontam para um grupo passam a oferecer **mais opções de troca**, com a quantidade recalculada pela mesma conta de sempre.

**Why this priority**: É a própria razão da feature — sem cobertura, a substituição (o diferencial da tese) só funciona no punhado curado da fundação. Sozinha já entrega valor: mais opções de troca para qualquer plano que aponte para os grupos.

**Independent Test**: Executar a classificação sobre a base atual; verificar que alimentos de perfil nutricional claro e antes sem vínculo ganham grupo compatível + porção de referência válida, e que um item flexível existente passa a listar esses alimentos como opções de troca.

**Acceptance Scenarios**:

1. **Given** alimentos da base sem vínculo e com perfil nutricional claro (ex.: um cereal cozido rico em carboidrato), **When** a classificação executa, **Then** cada um é vinculado a um grupo compatível com seu perfil, com porção de referência válida (maior que zero) coerente com o nutriente-base do grupo _(a regra exata de derivação/validação da porção é a Q3c)_.
2. **Given** um item flexível de um plano que aponta para o grupo X, **When** a classificação vincula novos alimentos a X, **Then** esses alimentos passam a aparecer como opções de troca daquele item, com quantidade recalculada preservando o nutriente-base — sem nenhuma mudança na conta.
3. **Given** os vínculos manuais curados existentes, **When** a classificação executa, **Then** todos permanecem exatamente como estavam (grupo e porção intactos).
4. **Given** um alimento com dados nutricionais incompletos ou zerados, **When** a classificação executa, **Then** ele fica **sem vínculo** e aparece no relatório de cobertura como não-classificável, com o motivo.

---

### User Story 2 - A correção humana vence, sempre (Priority: P2)

Todo vínculo carrega a sua origem — palpite automático ou decisão humana. Quando a nutri (ou o operador no papel dela) corrige um vínculo — move o alimento de grupo, ajusta a porção, remove o vínculo — essa decisão prevalece para sempre: nenhuma re-execução da classificação a sobrescreve.

**Why this priority**: É o que torna a pré-classificação clinicamente aceitável: o sistema propõe, o humano dispõe _(deriva da confirmação obrigatória da nutri — decisoes-produto.md:85 — e do Princípio V)_. Sem isso, re-executar a classificação destruiria curadoria clínica. _Honestidade sobre a derivação: a capacidade de corrigir a BASE (mover alimento de grupo, ajustar porção, remover vínculo) é **extensão do espírito** de decisoes-produto.md:89 — as "exceções" ali são os cadeados do plano, não a base — coberta pela Assumption "Correção manual sem tela", a confirmar no gate; não é decisão já tomada._

**Independent Test**: Mover um alimento classificado automaticamente para outro grupo (correção manual); re-executar a classificação; confirmar que a correção permanece intacta e identificada como manual. _(Pressupõe a US1 implementada — as user stories desta spec são camadas incrementais, não fatias independentes.)_

**Acceptance Scenarios**:

1. **Given** um alimento classificado automaticamente no grupo X, **When** o operador (no papel da nutri) o move para o grupo Y, **Then** o vínculo vigente passa a Y e fica identificado como decisão **manual**.
2. **Given** um vínculo manual (correção ou curadoria da fundação), **When** a classificação é re-executada — uma ou N vezes —, **Then** o vínculo manual permanece intacto; só uma **nova ação manual** o altera.
3. **Given** a base classificada, **When** quem revisa consulta os vínculos, **Then** consegue distinguir o que foi palpite automático do que foi decisão humana (transparência clínica).

---

### User Story 3 - Re-execução incremental + relatório de cobertura (Priority: P3)

A classificação é re-executável com segurança: sobre uma base inalterada, não muda nada; quando a base cresce (novos alimentos), classifica só os que ainda não têm vínculo. Cada execução produz um relatório de cobertura — o que foi classificado, o que ficou de fora e por quê, e quais grupos ficaram vazios — para o humano revisar as exceções.

**Why this priority**: É o que prepara a feature para a vida real (a base vai crescer; o import por IA da Fase 4 vai trazer alimentos novos) e dá ao humano a visão do que precisa de decisão. Sem ela, a US1 ainda entrega valor numa execução única.

**Independent Test**: Executar a classificação duas vezes sobre a mesma base e confirmar zero mudanças na segunda; adicionar alimentos novos, re-executar, e confirmar que só os novos foram classificados e que o relatório de cobertura reflete o estado final. _(Pressupõe a US1 implementada — camadas incrementais.)_

**Acceptance Scenarios**:

1. **Given** uma base já classificada e inalterada, **When** a classificação re-executa, **Then** nenhuma mudança observável ocorre (idempotência).
2. **Given** novos alimentos entraram na base após a última execução, **When** a classificação re-executa, **Then** apenas os alimentos **sem vínculo** são classificados; vínculos automáticos existentes permanecem intactos _(a preservação dos manuais sob re-execução é dona a US2 — cenário 2 / FR-008)_.
3. **Given** uma execução concluída, **When** o relatório de cobertura é consultado, **Then** ele informa: alimentos classificados (por grupo), alimentos não-classificáveis (com motivo) e grupos sem nenhum alimento — sem bloquear nada.

---

### Edge Cases

- **Alimento de perfil misto** (preparações como pizza; bebidas; itens cuja categoria não mapeia pra grupo): fica **sem grupo** e é relatado — introcável até decisão humana; a nutri pode vinculá-lo manualmente (Q3a). As categorias TACO "Bebidas", "Miscelâneas", "Alimentos preparados" e "Outros industrializados" não mapeiam pra grupo nenhum (sem-grupo por design).
- **Dados incompletos/zerados**: o alimento fica fora da classificação e é relatado; o sistema **não inventa** valor de dado de saúde (precedente já praticado na ingestão da base).
- **Nutriente-base zero para o grupo candidato** (ex.: uma carne num grupo cujo nutriente-base é carboidrato): vínculo proibido — a conta de equivalência não fecha (a mecânica de substituição já recusa alvo sem o nutriente-base).
- **Porção de referência derivada implausível** (alimento quase sem o nutriente-base do grupo → porção gigantesca para equivaler à porção típica): tratar como caso **sem confiança** — relatar, nunca vincular com porção absurda (o tratamento exato é parte da Q3; o critério observável de "implausível" é a Assumption "Limiar de confiança/plausibilidade").
- **Re-execução após a base crescer**: só os alimentos sem vínculo são classificados; manuais e automáticos existentes intactos.
- **Conflito automático × manual**: o automático apontou o grupo X, o humano moveu para Y → **Y vence para sempre**, até nova ação manual.
- **Re-execução do seed da fundação** (fluxo operacional vigente, seed-first): hoje o seed apaga e recria grupos e vínculos a cada execução — re-rodá-lo destruiria os vínculos automáticos E as correções manuais que esta feature promete preservar. FR-008/FR-009/SC-003 só valem na prática se o fluxo de seed deixar de ser destrutivo para grupos/vínculos (ou ficar consciente da origem) — dependência declarada nas Assumptions.
- **Correção manual que move/remove um vínculo**: pode legitimamente **reduzir** as opções de troca do paciente e o que o registro aceita como "troquei" válido — comportamento esperado e declarado (ver FR-013/FR-015), não regressão.
- **Grupo sem nenhum alimento / alimento sem grupo após a execução**: é resultado legítimo, relatado como cobertura — nunca um erro que bloqueia.
- **Plano existente**: a marcação de flexibilidade dos planos (cadeados, grupo apontado por item) **não muda sozinha**; o único efeito da classificação sobre planos existentes é mais opções de troca dentro dos grupos já apontados.

## Requirements _(mandatory)_

### Functional Requirements

#### O que a classificação produz

- **FR-001**: O sistema MUST pré-classificar automaticamente os alimentos da base nos grupos de substituição por **semelhança nutricional**, criando o vínculo alimento↔grupo que a substituição consome _(decisão "sem enlouquecer", decisoes-produto.md:89)_, via **regra determinística** — a **categoria TACO do alimento** mapeia pro grupo por macro-base (Q2c); o **perfil nutricional** (macro/100 g) atua como guarda (basis presente, porção plausível) e como desempate quando a categoria mapeia pra mais de um grupo (split de "Verduras, hortaliças": amiláceo com carb ≥ 10 g/100 g → Amidos; folhoso → Vegetais). Testável, explicável pra nutri, sem custo por execução _(Q1a → A, Sessão 2026-06-10; IA/LLM deferida pro import da Fase 4 — para alimento futuro **sem categoria**, o fallback é o perfil puro)_. O vínculo automático **vale imediatamente** como opção de troca pro paciente — sem revisão prévia _(Q1b, decisão do dono na Sessão 2026-06-10: desvio consciente do espírito do Princípio V/decisoes-produto.md:85, registrado nesta aprovação; **gatilho de reversão**: SC-002 reprovando, a vigência muda pra revisão prévia)_.
- **FR-002**: Todo vínculo criado automaticamente MUST carregar uma **porção de referência válida (maior que zero)**, coerente com o nutriente-base do grupo — é ela que ancora o recálculo de quantidade na troca (mecânica existente desde a Fase 0/1; esta feature a alimenta, não a muda). Vínculo sem porção válida MUST NOT existir. _("Maior que zero" é testável já; "coerente" depende da regra de derivação/validação da porção — Q3c — e da Assumption "Limiar de confiança/plausibilidade": este FR é **parcialmente pendente** da Q3.)_
- **FR-003**: O sistema MUST NOT vincular a um grupo um alimento cujo teor do **nutriente-base daquele grupo** seja zero ou desconhecido — a equivalência não fecharia (a própria mecânica de substituição já recusa alvo sem o nutriente-base).
- **FR-004**: Alimento com dados nutricionais **incompletos ou zerados** MUST ficar sem vínculo e ser relatado como não-classificável com o motivo; o sistema MUST NOT inventar valor de dado de saúde. _(O que conta como "completo" está definido na Assumption "Dados nutricionais completos" — isso torna este FR um teste binário.)_
- **FR-005**: Alimento **sem encaixe confiável** em grupo nenhum MUST ficar **sem grupo** (introcável até decisão humana) e ser relatado na cobertura — a nutricionista (ou o operador no papel dela, seed-first) **pode adicioná-lo a um grupo manualmente** (vínculo manual, regido por FR-007/FR-008). A classificação automática MUST vincular cada alimento a **no máximo um grupo** _(a validação do "troquei" no registro resolve um grupo por alimento; multi-grupo fica pra quando essa resolução for generalizada — limitação v0 declarada)_. A porção de referência automática MUST ser **derivada da equivalência** com o grupo, sob **guarda de plausibilidade** — fora da guarda, o caso vira "sem confiança" (sem grupo, relatado). "Encaixe confiável" e "porção plausível" MUST existir como critério observável (ver Assumption "Limiar de confiança/plausibilidade"). _(Q3 a/b/c → decisões do dono, Sessão 2026-06-10.)_
- **FR-006**: A execução MUST rodar **em lote sobre a base inteira** (junto da ingestão/atualização da base — relatório de cobertura como saída natural) e classificar **somente nos grupos do sistema** (customização por nutri deferida; o modelo de dados já suporta a coexistência) — _Q2a/Q2b: recomendações não contestadas na Sessão 2026-06-10, adotadas como default vetável_. A **ampliação da ingestão TACO** da allow-list de 23 pra base completa (~590 itens) **MUST fazer parte desta feature** _(Q2d → decisão do dono, Sessão 2026-06-10 — sem ela a US1 seria quase no-op)_. O conjunto canônico de grupos MUST ser os **~7 grupos de equivalência por macro-base** (Q2c, Sessão 2026-06-10 — ver Clarifications e a tabela no data-model): Amidos e cereais · Frutas · Vegetais · Proteínas · Laticínios · Gorduras e oleaginosas · Açúcares. A classificação MUST mapear a **categoria TACO do alimento** pro grupo (com o split de "Verduras, hortaliças" por perfil — amiláceo vs folhoso), e cada grupo carrega o **nutriente-base** da tabela do data-model. Criar grupos além desses é curadoria, nunca palpite da execução.

#### Correção humana vence

- **FR-007**: Todo vínculo MUST registrar a sua **origem** — automático (palpite do sistema) ou manual (decisão humana) — e quem revisa MUST conseguir distinguir uma da outra. _(Transparência clínica: deriva da confirmação obrigatória da nutri, decisoes-produto.md:85, e do Princípio V.)_
- **FR-008**: Uma correção manual (mover de grupo, ajustar porção, remover vínculo) MUST prevalecer sobre a classificação automática e MUST NOT ser sobrescrita por nenhuma re-execução; apenas uma **nova ação manual** altera um vínculo manual.
- **FR-009**: Os vínculos manuais pré-existentes (curadoria da fundação do produto) MUST permanecer intactos após qualquer execução da classificação.

#### Re-execução e cobertura

- **FR-010**: A classificação MUST ser re-executável e **idempotente**: re-executar sobre uma base inalterada MUST NOT produzir nenhuma mudança observável.
- **FR-011**: Quando a base cresce, a re-execução MUST classificar **apenas os alimentos sem vínculo**; vínculos existentes — automáticos ou manuais — MUST NOT ser alterados. (Re-classificar vínculos automáticos existentes seria uma ação explícita e separada, fora desta feature.)
- **FR-012**: Cada execução MUST produzir um **relatório de cobertura**: alimentos classificados (por grupo), alimentos não-classificáveis (com motivo) e grupos sem nenhum alimento. Cobertura incompleta MUST ser relatada, nunca tratada como erro que bloqueia a execução.

#### Fronteiras (transversais)

- **FR-013**: A feature MUST NOT alterar a matemática de substituição/equivalência, o motor de rebalanceamento **nem a validação do registro** (o "troquei" da Fase 3 também consome o vínculo alimento↔grupo pra validar consumo dentro do grupo) — ela apenas povoa os vínculos que essas mecânicas já consomem.
- **FR-014**: A feature MUST NOT alterar a flexibilidade já marcada nos planos existentes (cadeados e grupo apontado por item); o efeito sobre planos existentes limita-se a novos alimentos aparecendo como opção de troca nos grupos já apontados.
- **FR-015**: Nada MUST mudar na experiência do paciente além de **mais opções de troca disponíveis** — efeito da **classificação automática**. Uma **correção manual** que move/remove vínculo pode legitimamente **reduzir** opções (e o que o registro aceita como "troquei" válido) — comportamento esperado e declarado, não regressão. Nenhum número ou métrica nova é exposta (gate de exposição inalterado — o paciente vê ação, nunca número).

### Key Entities _(include if feature involves data)_

- **Vínculo alimento↔grupo**: a relação que torna um alimento substituível dentro de um grupo; carrega a **porção de referência** e, a partir desta feature, a **origem** (automático vs manual). Existe desde a Fase 0/1 — esta feature o povoa em escala.
- **Grupo de substituição**: conjunto de alimentos equivalentes entre si por um **nutriente-base** (a troca preserva esse nutriente). Conjunto canônico = os **~7 grupos por macro-base** (Q2c — Amidos/Frutas/Vegetais/Proteínas/Laticínios/Gorduras/Açúcares); só grupos do sistema nesta execução (Q2b); nutriente-base por grupo na tabela do data-model. O modelo já distingue grupos do sistema de grupos por-nutri.
- **Porção de referência**: a quantidade do alimento que vale "uma troca" dentro do grupo; é o que ancora o recálculo de quantidade ao substituir.
- **Origem do vínculo**: automático = palpite do sistema, identificado como tal; manual = decisão humana (correção ou curadoria), que vence sempre e nunca é sobrescrita por re-execução.
- **Relatório de cobertura**: o resultado de cada execução — classificados (por grupo), não-classificáveis (com motivo) e grupos vazios — insumo para o humano revisar as exceções.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Após uma execução, **100%** dos alimentos com dados nutricionais completos (definição na Assumption "Dados nutricionais completos") **da base vigente no momento da execução** (qual base: Q2d) terminam **vinculados a um grupo OU relatados como não-classificáveis com motivo** — zero alimento ignorado silenciosamente.
- **SC-002**: Aplicada às cegas aos alimentos dos **vínculos curados vigentes** (gabarito de validação), a classificação automática coincide com o grupo curado em **pelo menos 90%** dos casos. _Número **validado pelo dono** (Sessão 2026-06-10). Com os ~7 grupos por macro-base, a curadoria do seed (amidos/proteínas/frutas/vegetais) alinha-se ao mapeamento por categoria — o gabarito atual (16 vínculos) deve bater perto de 100%. Este SC arma o gatilho de reversão da vigência (Q1b); ampliar o gabarito junto com a base mantém o % estatisticamente firme._
- **SC-003**: **0** vínculos manuais alterados ou removidos por re-execuções da classificação (preservação em 100% dos casos). _Depende da dependência declarada sobre o seed (ver Assumptions): se o re-seed da fundação continuar destrutivo para grupos/vínculos, este SC é inalcançável na prática operacional._
- **SC-004**: Re-execução sobre base inalterada produz **0** mudanças observáveis (idempotência em 100% das re-execuções).
- **SC-005**: **100%** dos vínculos automáticos são distinguíveis dos manuais por quem revisa.
- **SC-006**: **100%** dos vínculos automáticos têm porção de referência válida (maior que zero) e nutriente-base presente — **0** trocas oferecidas que a mecânica de substituição recusaria por nutriente-base zero.
- **SC-007**: Pelo menos **80%** dos alimentos com dados completos (mesma definição do SC-001) recebem classificação automática — a decisão humana fica restrita às exceções ("a nutri só corrige exceções"). _Número **validado pelo dono** (Sessão 2026-06-10); viável com a base ampliada (Q2d) + os ~7 grupos por macro-base (Q2c), ambos decididos. Bebidas/Miscelâneas/preparados/industrializados ficam fora (sem-grupo) — a meta é sobre os com-dados-completos das categorias que mapeiam._
- **SC-008**: **0** mudanças observáveis na experiência do paciente além de mais opções de troca **por efeito da classificação automática** (correção manual pode reduzir opções — esperado e declarado, FR-015); **0** números novos expostos.

## Assumptions

- **Idempotência e re-execução seguras**: a classificação é re-executável; re-execução nunca sobrescreve vínculo manual e, sobre base inalterada, não muda nada.
- **Origem em todo vínculo**: todo vínculo registra se foi palpite automático ou decisão humana — a nutri precisa saber o que foi palpite do sistema (transparência clínica; deriva de decisoes-produto.md:85 e do Princípio V).
- **Curadoria da fundação intacta**: os vínculos manuais existentes permanecem exatamente como estão.
- **Mecânica inalterada**: a feature não muda a conta de substituição/equivalência nem o motor de rebalanceamento — só povoa os vínculos que eles consomem.
- **Paciente inalterado**: nada muda no app do paciente; o efeito visível da classificação é mais opções de troca disponíveis (correção manual pode reduzir — FR-015).
- **Vigência do vínculo automático decidida no gate** (Q1b → **vale imediatamente**, Sessão 2026-06-10): desvio consciente do espírito do Princípio V (decisoes-produto.md:85), registrado na aprovação; gatilho de reversão armado pelo SC-002 (reprovação na validação às cegas → revisão prévia).
- **Dados nutricionais completos** = energia e macronutrientes por 100 g presentes e não-nulos — o mesmo critério já praticado na ingestão da base (que exige os macros principais). É o denominador de SC-001/SC-007 e o critério binário do FR-004. (O teor do nutriente-base do grupo candidato é regra à parte — FR-003.)
- **Limiar de confiança/plausibilidade existe e é observável**: "encaixe confiável" (FR-005) e "porção plausível" (FR-002, edge cases) MUST ser definidos como condições mensuráveis (ex.: distância máxima ao perfil do grupo; intervalo admissível de gramas da porção derivada). A spec crava que o limiar **existe e onde será fixado** — o valor exato é decisão do plan, registrada lá.
- **Dependência — o seed da fundação precisa parar de destruir vínculos**: hoje o fluxo operacional de re-seed (seed-first, "roda quantas vezes quiser") apaga e recria grupos e vínculos a cada execução. Sem torná-lo não-destrutivo para grupos/vínculos (ou consciente da origem automático/manual), FR-008/FR-009/SC-003 são inalcançáveis na prática.
- **Re-execução não re-classifica automáticos existentes**: mudar o grupo de um alimento já vinculado (possivelmente em uso em planos) é mudança de comportamento clínico — seria uma ação explícita futura, não efeito colateral de re-execução.
- **Classifica dentro do conjunto canônico aprovado** (os ~7 grupos por macro-base — Q2c, Sessão 2026-06-10): a execução encaixa alimentos nesses grupos; **criar grupos além deles é curadoria/decisão de produto**, nunca palpite da execução. O nutriente-base de cada grupo (e a absorção dos 4 grupos do seed nos canônicos) está na tabela do data-model.
- **Correção manual sem tela**: a capacidade de corrigir existe no dado; o operador faz o papel da nutri (seed-first). A tela de revisão é a web futura. _(Corrigir a BASE é extensão do espírito de decisoes-produto.md:89 — as "exceções" ali são os cadeados do plano —, a confirmar no gate.)_
- **Base alvo = a base de alimentos vigente do produto (TACO)**: a ampliação da ingestão da allow-list de 23 pra TACO completa **faz parte desta feature** (Q2d → decisão do dono, Sessão 2026-06-10). A execução é re-executável para quando outras bases/volumes chegarem, mas integrar **outras bases** (TBCA etc.) não é desta feature.
- **Medidas caseiras**: alimentos recém-classificados sem medida caseira aparecem em gramas (comportamento já existente); curadoria de medidas caseiras não é desta feature.

## Out of Scope _(desta feature)_

- **UI da nutri para revisar/corrigir** a classificação (web futura) — a CAPACIDADE de correção manual existe no dado; a tela, não.
- **Import de plano por IA** (Fase 4) e **ampliação para outras bases** além da TACO (TBCA etc.) — a classificação é re-executável para quando isso chegar, mas integrar outras bases não é daqui. _(Ampliar a própria ingestão TACO está DENTRO da feature — Q2d decidida, Sessão 2026-06-10.)_
- **Mudança na matemática de substituição/equivalência/rebalanceamento** — a mecânica é a mesma; só a cobertura cresce.
- **Criação/edição da taxonomia de grupos pela nutri** — o conjunto canônico (~7 grupos) é do sistema; edição pela nutri não existe nesta feature.
- **Re-classificação dos vínculos automáticos existentes** (ex.: após melhorar o método) — ação explícita futura, não efeito de re-execução.
- **Atualização em massa da flexibilidade de planos existentes** (cadeados/grupos apontados por item) — o plano continua dizendo o que é flexível; a feature só amplia as opções dentro dos grupos.
- **Curadoria de medidas caseiras** para os alimentos recém-classificados.
- **Comida fora da lista** (registrar alimento livre fora do plano) — Fase 4.
