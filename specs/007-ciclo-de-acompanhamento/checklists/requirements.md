# Specification Quality Checklist: Ciclo de acompanhamento como objeto

**Purpose**: Validar a spec antes do planejamento
**Created**: 2026-06-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Sem detalhes de implementação (linguagens, frameworks, APIs)
- [x] Focada em valor ao usuário e necessidade de negócio
- [x] Escrita para stakeholders não-técnicos
- [x] Todas as seções obrigatórias preenchidas

## Requirement Completeness

- [x] Nenhum marcador [NEEDS CLARIFICATION] remanescente — **todos resolvidos na Sessão 2026-06-10** (Q1 → A+C; Q2 → A 1:N com vigência → **observa**; Q3 → B)
- [x] Requisitos testáveis e inequívocos — FR-002/FR-003/FR-005/FR-007/FR-011 fechados com as respostas do dono
- [x] Success criteria mensuráveis
- [x] Success criteria tech-agnostic
- [x] Cenários de aceitação definidos
- [x] Casos de borda identificados
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas

## Feature Readiness

- [x] Cada FR com critério de aceitação claro — fechados com as respostas do gate (Sessão 2026-06-10)
- [x] User scenarios cobrem os fluxos primários
- [x] Bate com os Success Criteria
- [x] Sem vazamento de implementação

## Notes

**Respondido pelo dono (Sessão 2026-06-10), encodado na spec (seção Clarifications):**

1. **Ciclo de vida e duração (FR-005)** → **A + C híbrido**: abre manual na consulta; fecha manual na reavaliação OU automaticamente na abertura do próximo (FR-002); prazo vencido não fecha sozinho. **Duração confirmada**: pela nutri, por ciclo, obrigatória ao abrir, sem default global (FR-003).
2. **Plano × ciclo (FR-007)** → grão **A (referência 1:N por períodos)**; replanejar no meio = nova vigência no mesmo ciclo. **Vigência → observa**: trocar o plano ativo segue sendo o ato que muda a vigência; o ciclo só grava a linha do tempo (uma única fonte de verdade sobre o presente).
3. **Retroatividade (FR-011)** → **B**: histórico pré-ciclo e dias sem ciclo ativo ficam fora de ciclo, consultáveis.

**Aberto:** nada — gate integralmente respondido.

**Defaults adotados como Assumptions (reversíveis, não re-perguntar):** não-sobreposição (1 ciclo ativo), fechar não destrói dado cru (LGPD/append-only), seed-first sem UI, fundação-não-cálculo (006/relatório consomem), atribuição derivada do período (sem re-ancorar registros), fronteira em dia-calendário com desempate determinístico e **mesma fonte de data do registro diário** (dívida de timezone consciente herdada da Fase 3; o fix futuro muda as duas pontas juntas), ciclo invisível ao paciente **nesta fase** (perene só o gate de número/percentual de adesão — FR-016 da 003 / FR-015 da 004), consulta como marco (não agenda), auth stub v0 (critério verificável do FR-013: superfície do paciente não expõe ciclo). A duração saiu deste bloco e **foi pro gate** (item 1) — era pergunta explícita do handoff §5.

**Limitação herdada declarada (Edge Cases):** no dia de fronteira com troca do plano ativo, o "consumido hoje" do app é escopado por plano — registros do mesmo dia sob o plano anterior saem da leitura. Já acontece hoje sem ciclo; o plano técnico deve avaliar esse caminho no dia de fronteira (SC-003).

**Decisões de produto citadas (não re-abertas):** objeto de primeira classe + plano versionado por ciclo (decisoes-produto.md:103); revisa olhando pra trás, sem ping (decisoes-produto.md:104); detector de fumaça deferido (decisoes-produto.md:105); ciclo como wrapper em fase posterior (plano-de-build.md:92); registro ancora direto no plano no v0 (FR-015 da spec 003); paciente vê ação, nunca número (FR-016 da 003 / FR-015 da 004).

Assumptions confirmadas pelo dono na Sessão 2026-06-10 ("de acordo"). Spec resolvida — próximo passo: **aval final do dono** → `/speckit-plan`.
