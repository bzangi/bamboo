# Specification Quality Checklist: Motor de rebalanceamento — negociar o dia

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Decisões de produto fechadas com o dono do produto antes da spec (Q1–Q10 do brainstorm da Fase 2): mecanismo (reescalar quantidades), dois modos de balanceamento (single-nutriente para troca de item; multi-macro para troca de opção/tipo-de-dia), alvo derivado das defaults, piso percentual tunável, faixa-alvo por tolerância, refeições seguintes por `position`, troca de tipo-de-dia com regra no motor + app v0 só exibe, persistência efêmera, combinação 1→2 50/50 ajustável, stack full com mobile como camada P3.
- Sem `[NEEDS CLARIFICATION]`: faixa (default sugerido ±10%) e piso (default sugerido 50%) cravados como defaults de sistema; a função-objetivo multi-macro tem prioridade decidida (casar kcal — FR-010), com a ponderação fina dos demais macros como decisão do `/speckit-plan`.
- **Parâmetros em 3 níveis (FR-012a–c)**: faixa e piso resolvem por precedência paciente > nutri > sistema. Implica um **acréscimo de schema** (campos de config semeados em `nutritionist`/`patient`) — única exceção à regra "sem persistência nova" (que segue valendo para o estado de escolha, FR-026). Modelagem exata = decisão do data-model no Plan; o gate do Plan deve passar pelo Constitution Check (Princípio III: resolução é pura no núcleo; a casca só lê o config).
- **Ponto de atenção para o gate**: as User Stories foram fatiadas como P1 = opções desiguais (motor + contrato, inclui a regra de tipo-de-dia no núcleo), P2 = combinação, P3 = app mobile (cliente fino), conforme a priorização aprovada. US3 (mobile) depende de US1/US2 (não é 100% independente) — desvio consciente do "cada story é MVP isolado", para honrar a decisão de provar o motor antes da tela (mesma sequência da Fase 1).
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
