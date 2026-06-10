# Specification Quality Checklist: Auto-classificação de alimentos em grupos de substituição

**Purpose**: Validar a spec antes do planejamento
**Created**: 2026-06-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Sem detalhes de implementação (linguagens, frameworks, APIs)
- [x] Focada em valor ao usuário e necessidade de negócio
- [x] Escrita para stakeholders não-técnicos
- [x] Todas as seções obrigatórias preenchidas

## Requirement Completeness

- [x] Nenhum marcador [NEEDS CLARIFICATION] remanescente — **todos resolvidos** (Sessões 2026-06-10; ver Notes)
- [x] Requisitos testáveis e inequívocos — FR-001/FR-005/FR-006 fechados com as decisões do dono (FR-002 segue parcialmente dependente da regra de derivação da porção, fixada no plan — Assumption do limiar)
- [x] Success criteria mensuráveis
- [x] Success criteria tech-agnostic
- [x] Cenários de aceitação definidos
- [x] Casos de borda identificados
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas

## Feature Readiness

- [x] Cada FR com critério de aceitação claro — fechados com as decisões do gate
- [x] User scenarios cobrem os fluxos primários
- [x] Bate com os Success Criteria
- [x] Sem vazamento de implementação

## Notes

- **Gate fechado (Sessões 2026-06-10)**: **Q1a → A** (heurística determinística); **Q1b → vale imediatamente** (desvio do Princípio V registrado; gatilho de reversão no SC-002); **Q2a → lote** e **Q2b → grupos do sistema** (recomendações não contestadas); **Q2c → taxonomia = as 13 categorias da TACO** (Cereais · Verduras/hortaliças · Frutas · Gorduras e óleos · Pescados · Carnes · Leite · Ovos · Bebidas · Miscelâneas · Açúcares · Leguminosas · Nozes); **Q2d → ampliação da ingestão TACO incluída**; **Q3 → (a) sem grupo no ambíguo, com adição manual pela nutri; (b) um grupo por vínculo; (c) porção derivada com guarda**. Pendência delegada ao plan (com aprovação no gate do plan): nutriente-base por grupo + reconciliação dos 4 grupos do seed + valores dos limiares de confiança/plausibilidade. **Pendências fora dos marcadores que a revisão adversarial fechou na spec** (não dependem das Q1–Q3): "dados completos" agora definido por Assumption (denominador de SC-001/SC-007, FR-004 binário); FR-002 marcado como parcialmente pendente da Q3c ("coerente" depende da regra de derivação da porção); o limiar de "encaixe confiável"/"porção plausível" virou Assumption explícita (existe e é observável; valor exato no plan).
- **Cada marcador agrega sub-perguntas; só sai da spec quando TODAS forem respondidas**: Q1 (a método, b vigência), Q2 (a momento, b grupos do sistema vs por-nutri, c taxonomia canônica, d base/ampliação da ingestão), Q3 (a ambíguo, b multi-grupo, c porção). Resposta parcial deixa o marcador meio-resolvido — não remover.
- **Q1 — Abordagem + vigência** (FR-001): (a) heurística determinística vs tabela curada vs IA/LLM em lote — atenção: 3 dos 4 grupos vigentes têm o mesmo nutriente-base (carb), macro dominante sozinho não separa; (b) **vínculo automático vale imediatamente ou exige revisão prévia?** — promovida de Assumption a clarification: Princípio V/decisoes-produto.md:85 (confirmação antes de valer) × decisoes-produto.md:89 (pré-classifica por default) colidem; decisão é do dono. Recomendação: A + vale imediatamente (desvio consciente do Princípio V, a registrar); se C (IA), revisão prévia obrigatória.
- **Q2 — Escopo + taxonomia + base** (FR-006): (a) lote vs sob demanda; (b) classificar só nos grupos do sistema (o modelo de dados JÁ suporta sistema + por-nutri coexistindo — a premissa anterior "muda o modelo" estava errada; o custo de por-nutri é operacional); (c) os 4 grupos do seed não cobrem a TACO — quem define/aprova o conjunto canônico, e quais são; (d) a ingestão atual é allow-list de 23 (16 já vinculados) — ampliar pra TACO completa entra na feature? Recomendação: lote + grupos do sistema + taxonomia expandida aprovada pelo dono + ampliação incluída.
- **Q3 — Ambiguidade/confiança** (FR-005): ambíguo sem grupo vs melhor palpite; multi-grupo sim/não (multi-grupo exige corrigir a resolução de grupo na validação do "troquei" do registro, que hoje assume um grupo por alimento); porção derivada vs fixa. Recomendação: sem-grupo + um grupo por vínculo + porção derivada com guarda de plausibilidade.
- **Números dos SCs validados pelo dono (Sessão 2026-06-10)**: SC-002 (90%) e SC-007 (80%) aceitos. Caveats operacionais mantidos: gabarito do SC-002 ainda é pequeno (16 vínculos — ampliar junto com a base antes de tratar o % como firme); SC-007 segue condicionado à taxonomia expandida (Q2c) — a base ampliada (Q2d) já está decidida.
- **Dependências declaradas na spec**: o re-seed da fundação hoje é destrutivo para grupos/vínculos — FR-008/FR-009/SC-003 exigem torná-lo não-destrutivo; o registro (validação do "troquei") foi acrescido como consumidor dos vínculos em FR-013; correção manual pode reduzir opções (FR-015/SC-008 qualificados).
- Defaults adotados como Assumptions reversíveis (não viraram marcador): idempotência/re-execução nunca sobrescreve manual; origem (automático vs manual) em todo vínculo; curadoria da fundação intacta; mecânica de substituição/motor/registro inalterada; re-execução não re-classifica automáticos; classificação só dentro dos grupos vigentes (não cria grupo); definição de "dados completos"; limiar observável de confiança/plausibilidade (valor no plan). _A antiga Assumption "vínculo automático vale imediatamente" foi promovida pra Q1(b)._
- Decisões de produto importadas e citadas: "sem enlouquecer" (decisoes-produto.md:89), Modelo 1 — lista de equivalência (decisoes-produto.md:88), confirmação clínica obrigatória/correção vence (decisoes-produto.md:85 + Princípio V). _Corrigir a BASE (mover de grupo/porção/remover vínculo) é extensão do espírito de :89 (as "exceções" ali são cadeados do plano), coberta por Assumption e a confirmar no gate — não decisão já tomada._
- US2/US3 pressupõem a US1 (camadas incrementais, não fatias independentes) — explicitado nos Independent Tests; a preservação do manual sob re-execução é dona a US2 (FR-008), e a US3 referencia em vez de duplicar.
- Assumptions confirmadas pelo dono na Sessão 2026-06-10 ("ok"). Após a conversa fechar Q1b/Q2c/Q3, resolver os 3 marcadores remanescentes e re-validar antes do `/speckit-plan`.
