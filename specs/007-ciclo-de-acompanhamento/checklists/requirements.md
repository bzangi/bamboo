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

- [ ] Nenhum marcador [NEEDS CLARIFICATION] remanescente — **3 remanescentes, por desenho** (draft aguardando gate; ver Notes)
- [ ] Requisitos testáveis e inequívocos — FR-005, FR-007 e FR-011 dependem das decisões em aberto (FR-003/FR-004 seguem a resposta do FR-005); os demais são testáveis
- [x] Success criteria mensuráveis
- [x] Success criteria tech-agnostic
- [x] Cenários de aceitação definidos
- [x] Casos de borda identificados
- [x] Escopo claramente delimitado
- [x] Dependências e premissas identificadas

## Feature Readiness

- [ ] Cada FR com critério de aceitação claro — pendente nos 3 FRs com marcador (ciclo de vida, grão plano×ciclo, retroatividade)
- [x] User scenarios cobrem os fluxos primários
- [x] Bate com os Success Criteria
- [x] Sem vazamento de implementação

## Notes

**Aberto (aguardando decisão do dono do produto — gate Specify→Plan):**

1. **Ciclo de vida e duração (FR-005)**: o que abre e o que fecha um ciclo — manual (A), fecha automático no prazo (B) ou abrir-fecha-o-anterior (C) — **e** a pergunta "duração?" do handoff §5: quem define a duração prevista, se há default sugerido pelo produto e se é obrigatória ao abrir. Recomendação do rascunho: **A** (duração é previsão, não trava; C pode ser camada de conveniência depois), com duração definida pela nutri a cada ciclo, obrigatória ao abrir, sem default global.
2. **Plano × ciclo (FR-007)**: grão do "plano versionado por ciclo" — referência 1:N (A) ou cópia 1:1 (B). Versionar em si **já está decidido** (decisoes-produto.md:103); deferir não é opção. A decisão inclui como o vínculo convive com a vigência que já existe (plano ativo do paciente + plano apontado por cada registro) — sem duas fontes de verdade sobre "qual plano vige". Recomendação: **A** (suporta replanejamento no meio do ciclo sem inventar consulta nova).
3. **Retroatividade (FR-011)**: histórico da Fase 3 e registros sem ciclo ativo — ciclo retroativo (A), fora-de-ciclo consultável (B) ou início limpo (C). Recomendação: **B** (não inventa marco clínico que não houve; responde também o caso geral "dia sem ciclo").

**Defaults adotados como Assumptions (reversíveis, não re-perguntar):** não-sobreposição (1 ciclo ativo), fechar não destrói dado cru (LGPD/append-only), seed-first sem UI, fundação-não-cálculo (006/relatório consomem), atribuição derivada do período (sem re-ancorar registros), fronteira em dia-calendário com desempate determinístico e **mesma fonte de data do registro diário** (dívida de timezone consciente herdada da Fase 3; o fix futuro muda as duas pontas juntas), ciclo invisível ao paciente **nesta fase** (perene só o gate de número/percentual de adesão — FR-016 da 003 / FR-015 da 004), consulta como marco (não agenda), auth stub v0 (critério verificável do FR-013: superfície do paciente não expõe ciclo). A duração saiu deste bloco e **foi pro gate** (item 1) — era pergunta explícita do handoff §5.

**Limitação herdada declarada (Edge Cases):** no dia de fronteira com troca do plano ativo, o "consumido hoje" do app é escopado por plano — registros do mesmo dia sob o plano anterior saem da leitura. Já acontece hoje sem ciclo; o plano técnico deve avaliar esse caminho no dia de fronteira (SC-003).

**Decisões de produto citadas (não re-abertas):** objeto de primeira classe + plano versionado por ciclo (decisoes-produto.md:103); revisa olhando pra trás, sem ping (decisoes-produto.md:104); detector de fumaça deferido (decisoes-produto.md:105); ciclo como wrapper em fase posterior (plano-de-build.md:92); registro ancora direto no plano no v0 (FR-015 da spec 003); paciente vê ação, nunca número (FR-016 da 003 / FR-015 da 004).

Spec pronta para o gate; após as 3 respostas, remover os marcadores e seguir para `/speckit-plan`.
