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

- [ ] Nenhum marcador [NEEDS CLARIFICATION] remanescente — **1 remanescente**: a sub-decisão da **vigência** no FR-007 (ciclo manda vs observa o plano ativo); Q1/Q3 e o grão da Q2 foram respondidos na Sessão 2026-06-10 (ver Notes)
- [x] Requisitos testáveis e inequívocos — FR-002/FR-003/FR-005/FR-011 fechados com as respostas do dono; FR-007 testável no grão (1:N), pendente só no mecanismo da vigência
- [x] Success criteria mensuráveis
- [x] Success criteria tech-agnostic
- [x] Cenários de aceitação definidos
- [x] Casos de borda identificados
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas

## Feature Readiness

- [ ] Cada FR com critério de aceitação claro — pendente só no FR-007 (sub-decisão da vigência); os demais fechados
- [x] User scenarios cobrem os fluxos primários
- [x] Bate com os Success Criteria
- [x] Sem vazamento de implementação

## Notes

**Respondido pelo dono (Sessão 2026-06-10), encodado na spec (seção Clarifications):**

1. **Ciclo de vida e duração (FR-005)** → **A + C híbrido**: abre manual na consulta; fecha manual na reavaliação OU automaticamente na abertura do próximo (FR-002); prazo vencido não fecha sozinho. **Duração confirmada**: pela nutri, por ciclo, obrigatória ao abrir, sem default global (FR-003).
2. **Plano × ciclo (FR-007)** → grão **A (referência 1:N por períodos)**; replanejar no meio = nova vigência no mesmo ciclo.
3. **Retroatividade (FR-011)** → **B**: histórico pré-ciclo e dias sem ciclo ativo ficam fora de ciclo, consultáveis.

**Aberto (única pendência deste gate):**

- **Sub-decisão da vigência (FR-007)**: o ciclo **manda** na vigência ("qual plano vige" deriva do vínculo do ciclo) ou **observa** o mecanismo atual (trocar o plano ativo segue sendo o ato que muda a vigência; o ciclo grava a linha do tempo dessas trocas)? Recomendação: **observa** — uma única fonte de verdade, zero mudança nos fluxos existentes.

**Defaults adotados como Assumptions (reversíveis, não re-perguntar):** não-sobreposição (1 ciclo ativo), fechar não destrói dado cru (LGPD/append-only), seed-first sem UI, fundação-não-cálculo (006/relatório consomem), atribuição derivada do período (sem re-ancorar registros), fronteira em dia-calendário com desempate determinístico e **mesma fonte de data do registro diário** (dívida de timezone consciente herdada da Fase 3; o fix futuro muda as duas pontas juntas), ciclo invisível ao paciente **nesta fase** (perene só o gate de número/percentual de adesão — FR-016 da 003 / FR-015 da 004), consulta como marco (não agenda), auth stub v0 (critério verificável do FR-013: superfície do paciente não expõe ciclo). A duração saiu deste bloco e **foi pro gate** (item 1) — era pergunta explícita do handoff §5.

**Limitação herdada declarada (Edge Cases):** no dia de fronteira com troca do plano ativo, o "consumido hoje" do app é escopado por plano — registros do mesmo dia sob o plano anterior saem da leitura. Já acontece hoje sem ciclo; o plano técnico deve avaliar esse caminho no dia de fronteira (SC-003).

**Decisões de produto citadas (não re-abertas):** objeto de primeira classe + plano versionado por ciclo (decisoes-produto.md:103); revisa olhando pra trás, sem ping (decisoes-produto.md:104); detector de fumaça deferido (decisoes-produto.md:105); ciclo como wrapper em fase posterior (plano-de-build.md:92); registro ancora direto no plano no v0 (FR-015 da spec 003); paciente vê ação, nunca número (FR-016 da 003 / FR-015 da 004).

Assumptions confirmadas pelo dono na Sessão 2026-06-10 ("de acordo"). Após a sub-decisão da vigência, remover o marcador do FR-007 e seguir para `/speckit-plan`.
