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

- [ ] Nenhum marcador [NEEDS CLARIFICATION] remanescente — **3 abertos por design** (FR-006 fórmula = forma do valor **Q1a** + dimensão da medição **Q1b**; FR-007 refeição não registrada **Q2**; FR-002 fonte do tipo-de-dia do alvo **Q3**); são as decisões de produto deste gate
- [ ] Requisitos testáveis e inequívocos — FR-002/FR-006/FR-007 (e FR-008, que segue a Q1b) aguardam a decisão do dono; os demais FRs são testáveis e fechados
- [x] Success criteria mensuráveis
- [x] Success criteria tech-agnostic
- [x] Cenários de aceitação definidos (US2.3 explicitamente condicionado à Q1; US1.1/1.2, US2.2/2.4 e SC-003 ancorados na classificação dentro/fora garantida pelo FR-006a, válida sob qualquer resposta da Q1)
- [x] Casos de borda identificados (inclui a limitação de override estendida à **cobertura**, com pareamento por posição equivalente)
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas (auth real da nutri declarada como dependência **no FR-016**; snapshot/versionamento da régua registrado como possível requisito do ciclo 007/relatório)

## Feature Readiness

- [ ] Cada FR com critério de aceitação claro — os FRs em aberto só fecham com as respostas do dono
- [x] User scenarios cobrem os fluxos primários (valor do dia, adequação aderente, série temporal, invariante de privacidade — incluindo o cenário **negativo de acesso**: identidade de paciente negada na via da nutri, US4.3/SC-008)
- [x] Bate com os Success Criteria (SC-002 redigido formula-agnóstico: mesmo desfecho nutricional → mesma adesão)
- [x] Sem vazamento de implementação (o COMO da via de consulta da nutri fica pro Plan; a spec crava só QUEM pode ver e o cenário negativo verificável)

## Notes

- **Draft aguardando o gate Specify→Plan** — os itens não marcados decorrem dos 3 [NEEDS CLARIFICATION], intencionais (decisões que mudam escopo/UX, sem default razoável que caiba ao agente cravar):
  1. **Q1 Fórmula** (FR-006), em duas partes: **Q1a forma do valor** (binário / contínua saturada na faixa / por refeição — recomendada: **B**, com saturação em 100% dentro da faixa, obrigatória pra não violar "faixa, não teto") e **Q1b dimensão da medição** (só kcal / os 4 nutrientes / kcal + flags por macro — recomendada: **(iii)**; a faixa da Fase 2 é por nutriente e "casar as kcal" é desempate do motor, não definição de aderência).
  2. **Q2 Refeição não registrada** (FR-007): não-aderente / neutra + cobertura / dia vazio = sem dado. Recomendada: **B (neutra + cobertura)** — subsume C; A pune não-registrar, não não-seguir.
  3. **Q3 Tipo-de-dia que define o alvo** (FR-002): default da programação sempre / tipo dos registros quando uniforme com default como fallback / override detectado = sem dado. Recomendada: **B** — sob (A), dia legitimamente trocado de tipo é medido contra a faixa errada, contradizendo FR-005 ("adequação conta como aderente").
- **Revisão adversarial aplicada** (pré-gate): a antiga pergunta de **janela/agregação** foi demovida a Assumption vetável (mínimo YAGNI: só a série diária — FR-011 fechado, US3.3 concretizado); a **dimensão da medição** subiu de Assumption pra Q1b (o handoff manda perguntar a fórmula, e a dimensão é parte dela); a **fonte do tipo-de-dia** subiu de Assumption pra Q3 (contradizia FR-005 sob override legítimo); **FR-006a** novo garante a classificação dentro/fora sob qualquer fórmula; **FR-016** ganhou os dois requisitos verificáveis de acesso no v0 (omissão total + via da nutri inalcançável por identidade de paciente — US4.3/SC-008) e declara a auth real da nutri como dependência; **FR-012** cravou "sem plano ativo" como estado do paciente na consulta (o modelo v0 não tem vigência de plano por data — fonte do plano = o ativo corrente, ver Assumptions); a limitação de override foi estendida à **cobertura** (pareamento por posição equivalente; precedente Fase 4).
- **Riscos assumidos sinalizados no gate** (não são perguntas, mas o dono deve ver): régua corrente re-lê o passado (mudança de plano/tolerância reescreve a história que o relatório vai contar; dependência registrada pro 007/relatório).
- Decisões de produto pré-existentes citadas com fonte (decisoes-produto.md:50, 61, 64–66, 69, 103, 109; specs 002/003/004) — nenhuma regra de negócio inventada; defaults adotados estão em Assumptions, todos reversíveis.
- Próximo passo: respostas do dono → encodar nas FR-002/006/007 (ex.: via `/speckit-clarify`) → `/speckit-plan`.
