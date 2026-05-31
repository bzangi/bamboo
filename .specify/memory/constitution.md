<!--
Sync Impact Report
==================
Version change: template (não versionado) → 1.0.0
Bump rationale: ratificação inicial — primeira constituição concreta, destilada de CLAUDE.md + docs/.
Principles (todos novos):
  - I.   Adaptar, não apenas mostrar
  - II.  Mostra o certo por padrão, deixa trocar num toque, nunca barra
  - III. Functional Core / Imperative Shell (NON-NEGOTIABLE)
  - IV.  Spec-Driven Development (NON-NEGOTIABLE)
  - V.   LGPD desde o dia zero (NON-NEGOTIABLE)
  - VI.  YAGNI / escopo enxuto, MVP-first
Added sections:
  - Restrições de Arquitetura e Stack
  - Fluxo de Desenvolvimento
  - Governance
Templates:
  - ✅ .specify/templates/plan-template.md — Constitution Check preenchido com gates concretos
  - ✅ .specify/templates/tasks-template.md — disciplina de teste alinhada ao Princípio IV
  - ✅ .specify/templates/spec-template.md — já alinhado (MUST, edge cases, success criteria); sem alteração
Deferred TODOs: nenhum (data de ratificação = data de adoção desta constituição).
-->

# Bamboo Constitution

## Core Principles

### I. Adaptar, não apenas mostrar

O valor do produto é **adaptar** o plano à vida real, não exibi-lo — *ver* o plano é
commodity que todo concorrente entrega. O trabalho do paciente é **seguir + adequar**; os
recursos de adequar (substituição, rebalanceamento, autonomia) são o que faz os de seguir
sobreviverem ao mundo real.

- Toda feature MUST justificar como ajuda o paciente a seguir adaptando; na dúvida entre
  exibir e adaptar, adaptar vence.
- O produto MUST NOT competir na commodity (editor de plano, agenda, prontuário, base de
  alimentos); diferencia-se em **autonomia + rebalanceamento + ciclo de acompanhamento**.
- Rationale: plano rígido é abandonado; plano que dobra sem quebrar sustenta ~80% de adesão.

### II. Mostra o certo por padrão, deixa trocar num toque, nunca barra

A assinatura de interação vale para TODA decisão de UX.

- Home é **"o agora"**: a refeição do momento, sem o paciente caçar nada.
- Defaults (ex.: tipo-de-dia) MUST ser anunciados, nunca silenciosos, e trocáveis num toque.
- Registro é **pendurado na consulta** (feito/troquei/pulei), nunca formulário separado.
- O alvo é **faixa, não teto**: comer de menos é tão fora de adesão quanto comer de mais.
- O rebalanceamento entrega **ação**, não número — proibido "bucket de calorias em %" (vira
  culpa). O sistema MUST avisar a consequência ANTES de o paciente agir.
- **Piso inviolável**: o sistema MUST NOT mandar o paciente passar fome para compensar; se o
  desvio não cabe, recusa e orienta ("hoje ficou acima, segue leve e volta amanhã").
- Sem gamificação de restrição nem contagem obsessiva.

### III. Functional Core / Imperative Shell (NON-NEGOTIABLE)

Regra de negócio é **função pura**; I/O é casca.

- O núcleo (`packages/core`) MUST ser TS puro: sem I/O, sem `throw`, sem mutação, sem
  dependência de Nest/Node. Roda no servidor **e** no app (offline). A UI é cliente fino.
- **Erro como valor**: o núcleo retorna `Result<T, E>` e NUNCA lança. Erros de domínio são
  discriminated unions tipadas, casadas com `ts-pattern` (`.exhaustive()`).
- **Imutabilidade**: `readonly`/spread; MUST NOT mutar entidade carregada do banco.
- A casca (`apps/api`) faz I/O (Drizzle, transações, locks), orquestra o núcleo e converte
  `Result` em `HttpException` na borda. Providers Nest MUST NOT guardar estado mutável.
- Responses MUST NOT serializar entidade do Drizzle/domínio direto — mapear via DTO com
  função pura.

### IV. Spec-Driven Development (NON-NEGOTIABLE)

Toda tarefa segue **Constitution → Specify → Plan → Tasks → Implement**, sem pular etapas.

- Nenhuma implementação começa sem spec clara **aprovada pelo dono do produto**.
- Faltando clareza, PARE e pergunte. O agente MUST NOT assumir comportamento, inventar regra
  de negócio ou preencher lacuna por conta própria.
- Validação em dois níveis: **estrutural** no DTO (`class-validator`, na borda) e **de
  negócio** no núcleo puro (via `Result`).
- **TDD**: o teste vem ANTES da implementação e cobre critérios de aceitação, casos de borda
  e estados de erro definidos na spec.

### V. LGPD desde o dia zero (NON-NEGOTIABLE)

Dado de saúde é tratado como sensível desde a primeira linha — é transversal, não uma fase.

- Controle de acesso, criptografia e consentimento MUST existir desde a Fase 0.
- Plano estruturado por IA MUST passar por confirmação clínica da nutri antes de valer.
- Exposição de métricas ao paciente MUST respeitar o gate controlado pela nutri.
- Rationale: empurrar privacidade pro fim vira dívida cara e risco legal.

### VI. YAGNI / escopo enxuto, MVP-first

Constrói-se o mínimo que prova a tese; o resto é deferido conscientemente.

- MUST respeitar a lista de "Fora de escopo" vigente; commodity entra só o suficiente para
  ser crível.
- Infra pesada é deferida por decisão consciente (sistema de efeitos completo, `Effect`,
  `fp-ts` ficam fora do MVP).
- **Seed-first** (semear plano no banco em vez de esperar a UI da nutri) e **RN-first** (Expo
  direto, sem web responsivo intermediário) são atalhos deliberados.

## Restrições de Arquitetura e Stack

- **Stack:** Node.js + TypeScript + NestJS + PostgreSQL + Drizzle (backend); React Native +
  Expo (app do paciente); Next.js (web da nutri, fase posterior). Monorepo pnpm + Turborepo,
  Node 20+, TypeScript strict, testes em Vitest. Versões sempre estáveis atuais — não chumbar.
- **Estrutura:** `apps/{api,mobile}` + `packages/{db,core,types,api-client}`, importados via
  alias `@bamboo/*`. O que é produto e NÃO vem de gerador: o **schema** (`packages/db`) e o
  **core**; o resto vem de gerador oficial.
- **Concorrência:** operações sensíveis (cobrança, contagem de pacientes do pool) MUST usar
  transações explícitas (`db.transaction`) e locks explícitos.
- **Bibliotecas:** recomendados `neverthrow` (ou `Result` à mão) e `ts-pattern`; opcionais
  `remeda`/`immer`; **deferidos** `Effect` e `fp-ts`.
- **Modelagem (v0):** itens penduram em `meal_option`; `is_locked` + `substitution_group_id`
  marcam a flexibilidade; `reference_portion_grams` ancora a conta de substituição; o plano
  pertence direto ao paciente. Base **TACO** + **medidas caseiras** (Brasil).
- Detalhe completo e exemplos canônicos vivem em `CLAUDE.md` e `docs/` — esta seção crava os
  invariantes; aqueles documentos não podem contradizê-los.

## Fluxo de Desenvolvimento

- Pipeline operacionalizado pelas skills do Spec Kit: `/speckit-constitution`,
  `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement` (opcionais:
  `/speckit-clarify`, `/speckit-checklist`, `/speckit-analyze`).
- **Gates de aprovação:** avançar de Specify → Plan e de Plan → Tasks exige aprovação
  explícita do dono do produto. Surgindo ambiguidade no Implement, volta-se a Specify/Plan.
- Cada Plan MUST passar no "Constitution Check" (ver `plan-template.md`); violar um princípio
  exige justificativa registrada no Complexity Tracking.
- O detalhamento do fluxo está em `CLAUDE.md › Fluxo de Desenvolvimento` e é vinculante.

## Governance

- Esta constituição **supersede** outras práticas; em conflito, a constituição vence.
- **Emendas** exigem: proposta documentada, aprovação do dono do produto (Bruno) e bump de
  versão semântica.
  - MAJOR: remoção ou redefinição incompatível de princípio ou regra de governança.
  - MINOR: novo princípio/seção ou expansão material de guia.
  - PATCH: clarificação, redação, correção não-semântica.
- **Compliance:** todo Plan e toda revisão MUST verificar conformidade com os princípios.
- **Guia de runtime:** `CLAUDE.md` + `docs/` orientam o dia a dia; esta constituição destila
  os invariantes não-negociáveis que aqueles documentos detalham.

**Version**: 1.0.0 | **Ratified**: 2026-05-31 | **Last Amended**: 2026-05-31
