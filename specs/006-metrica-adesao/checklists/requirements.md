# Specification Quality Checklist: Métrica de adesão a partir do registro (só-nutri)

**Purpose**: Validar a spec antes do planejamento
**Created**: 2026-06-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Sem detalhes de implementação (linguagens, frameworks, APIs)
- [x] Focada em valor ao usuário e necessidade de negócio
- [x] Escrita para stakeholders não-técnicos
- [x] Todas as seções obrigatórias preenchidas

## Requirement Completeness

- [x] Nenhum marcador [NEEDS CLARIFICATION] remanescente — **todos resolvidos na Sessão 2026-06-10** (Q1a → B; Q1b → iii; Q2 → B; Q3 → B; agregação → série + média do período, decisão do dono)
- [x] Requisitos testáveis e inequívocos — FR-002/FR-006/FR-007/FR-008/FR-011 fechados com as respostas do dono
- [x] Success criteria mensuráveis
- [x] Success criteria tech-agnostic
- [x] Cenários de aceitação definidos (US2.3 explicitamente condicionado à Q1; US1.1/1.2, US2.2/2.4 e SC-003 ancorados na classificação dentro/fora garantida pelo FR-006a, válida sob qualquer resposta da Q1)
- [x] Casos de borda identificados (inclui a limitação de override estendida à **cobertura**, com pareamento por posição equivalente)
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas (auth real da nutri declarada como dependência **no FR-016**; snapshot/versionamento da régua registrado como possível requisito do ciclo 007/relatório)

## Feature Readiness

- [x] Cada FR com critério de aceitação claro — fechados com as respostas do gate (Sessão 2026-06-10)
- [x] User scenarios cobrem os fluxos primários (valor do dia, adequação aderente, série temporal, invariante de privacidade — incluindo o cenário **negativo de acesso**: identidade de paciente negada na via da nutri, US4.3/SC-008)
- [x] Bate com os Success Criteria (SC-002 redigido formula-agnóstico: mesmo desfecho nutricional → mesma adesão)
- [x] Sem vazamento de implementação (o COMO da via de consulta da nutri fica pro Plan; a spec crava só QUEM pode ver e o cenário negativo verificável)

## Notes

- **Gate Specify→Plan — perguntas respondidas pelo dono (Sessão 2026-06-10)**, encodadas na spec (seção Clarifications):
  1. **Q1a forma do valor → B** (contínua saturada na faixa, 100% dentro; desvio a partir da borda, clamp 0) — FR-006.
  2. **Q1b dimensão → (iii)** (kcal como valor + flags por macro fora da respectiva faixa) — FR-006/FR-008.
  3. **Q2 refeição não registrada → B** (neutra + cobertura do registro; dia sem registro = sem dado) — FR-007.
  4. **Q3 tipo-de-dia do alvo → B** (tipo dos registros vigentes quando uniforme; fallback no default da programação) — FR-002.
  5. **Agregação → série + média do período** (o dono modificou o default "só série diária": a média da pontuação diária determina a métrica final; régua diária corrente mantida de propósito, flexível às alterações da nutri) — FR-011, US3, SC-010.
- **Revisão adversarial aplicada** (pré-gate): a antiga pergunta de **janela/agregação** foi demovida a Assumption vetável (mínimo YAGNI: só a série diária — FR-011 fechado, US3.3 concretizado); a **dimensão da medição** subiu de Assumption pra Q1b (o handoff manda perguntar a fórmula, e a dimensão é parte dela); a **fonte do tipo-de-dia** subiu de Assumption pra Q3 (contradizia FR-005 sob override legítimo); **FR-006a** novo garante a classificação dentro/fora sob qualquer fórmula; **FR-016** ganhou os dois requisitos verificáveis de acesso no v0 (omissão total + via da nutri inalcançável por identidade de paciente — US4.3/SC-008) e declara a auth real da nutri como dependência; **FR-012** cravou "sem plano ativo" como estado do paciente na consulta (o modelo v0 não tem vigência de plano por data — fonte do plano = o ativo corrente, ver Assumptions); a limitação de override foi estendida à **cobertura** (pareamento por posição equivalente; precedente Fase 4).
- **Risco assumido ACEITO pelo dono na sessão**: régua corrente re-lê o passado (mantida deliberadamente — flexível às alterações da nutri no plano; dependência de snapshot registrada pro 007/relatório).
- Decisões de produto pré-existentes citadas com fonte (decisoes-produto.md:50, 61, 64–66, 69, 103, 109; specs 002/003/004) — nenhuma regra de negócio inventada; defaults adotados estão em Assumptions, todos reversíveis.
- Próximo passo: **aval final do dono sobre a spec resolvida** → `/speckit-plan`.
