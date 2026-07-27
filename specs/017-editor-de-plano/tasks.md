# Tasks: A nutri monta o plano alimentar pela tela

**Feature**: `017-editor-de-plano` · **Spec**: `./spec.md` · **Plan**: `./plan.md`

Ordem obrigatória. Test-first em toda task com lógica. `pnpm lint` + Prettier limpos antes de
fechar cada uma (Done de toda task, `CLAUDE.md`).

---

## Fase A — Fundação do módulo

- **T001** — DTOs em `packages/types/src/plano-editor.ts` + export no barril.
  _Aceitação_: `check-types` limpo; nenhum DTO existente alterado.
  _Depende de_: —

- **T002** — `apps/api/src/plano-editor/validar.ts` + `validar.unit.test.ts` (test-first).
  Cobre: texto obrigatório/limite/trim, número positivo, inteiro em faixa, valor de enum, campo
  ausente vs. `null` (D7).
  _Aceitação_: testes verdes; cada helper recusa com mensagem que nomeia o campo.
  _Depende de_: —

- **T003** — `plano-editor.module.ts` vazio, registrado no `app.module.ts`, atrás do
  `NutriKeyGuard`.
  _Aceitação_: app sobe; `GET /nutri/plans/<uuid>` sem header → 403.
  _Depende de_: T002

---

## Fase B — Paciente: U + D (US1)

- **T010** — e2e `nutri-paciente-crud.e2e-spec.ts` (test-first, visto vermelho).
  Casos: patch de nome · patch parcial preserva os outros · `null` limpa · `exposure` inválido 400 ·
  peso/altura inválidos 400 · 404 em id inexistente · delete de paciente limpo · delete com
  `meal_event` 409.
  _Depende de_: T002

- **T011** — `PatientsService.atualizar()` + `excluir()` e os handlers no controller.
  _Aceitação_: T010 verde; `GET /nutri/patients` inalterado (suíte 015/016 verde sem edição).
  _Depende de_: T010

---

## Fase C — Plano: CRUD + leitura do grafo (US2)

- **T020** — e2e `plano-editor.e2e-spec.ts` (test-first), parte de plano.
  Casos: criar plano escreve **só** `plan` (contagens de `day_type`/`meal`/`day_schedule` iguais
  antes/depois) · 1º plano nasce ativo, 2º nasce inativo · listar · renomear · GET do grafo vazio ·
  delete limpo · delete com `meal_event` 409 · delete com vigência de ciclo 409 · delete do plano
  ativo com ciclo aberto 409.
  _Depende de_: T003

- **T021** — `plano.leitura.ts`: as 4 queries + a montagem (função pura) + unit da montagem.
  _Aceitação_: uma requisição devolve o grafo inteiro; refeições ordenadas por posição, opções por
  label, itens por nome do alimento.
  _Depende de_: T020

- **T022** — `plano.service.ts` + `plano.controller.ts`: listar/criar/patch/delete de plano.
  _Aceitação_: T020 verde.
  _Depende de_: T021

---

## Fase D — Grafo do dia (US3)

- **T030** — e2e da parte de tipo-de-dia e semana em `plano-editor.e2e-spec.ts`.
  Casos: criar tipo-de-dia vazio · renomear · `PUT` da semana substitui a anterior · semana com
  tipo-de-dia de outro plano 422 · semana incompleta/dia repetido 400 · delete de tipo-de-dia
  referenciado pela semana 409 · delete de tipo-de-dia com registro 409 · delete limpo faz cascata.
  _Depende de_: T022

- **T031** — tipo-de-dia + semana no `plano.service.ts`/controller.
  _Aceitação_: T030 verde.
  _Depende de_: T030

- **T032** — e2e `refeicao-editor.e2e-spec.ts` (test-first).
  Casos: criar refeição · position duplicada 409 · patch de position para uma livre · horário
  opcional · criar opção default desmarca as irmãs · patch de default idem · delete da única opção
  409 · delete da default promove outra · criar item com gramas ≤ 0 → 400 · item com grupo do qual
  o alimento não participa 422 · item travado **e** com grupo 400 · delete de refeição com registro
  409 · delete de refeição limpa faz cascata em opções e itens.
  _Depende de_: T031

- **T033** — `refeicao.service.ts` + `refeicao.controller.ts`.
  _Aceitação_: T032 verde.
  _Depende de_: T032

---

## Fase E — Catálogo (US4)

- **T040** — e2e `catalogo.e2e-spec.ts` (test-first).
  Casos: busca por trecho, insensível a caso · `q` vazio devolve página · limite respeitado ·
  criar alimento marca origem não-TACO · patch · delete de alimento em uso 409 · criar grupo ·
  `basis` inválida 400 · vincular alimento ao grupo grava porção de referência e `origin='manual'` ·
  desvincular · delete de grupo em uso 409.
  _Depende de_: T003

- **T041** — `catalogo.service.ts` + `catalogo.controller.ts`.
  _Aceitação_: T040 verde; a ingestão TACO (008) continua idempotente sobre os alimentos criados
  à mão (não têm `taco_id`).
  _Depende de_: T040

---

## Fase F — Web (US5)

- **T050** — Tailwind v4 + shadcn/ui no `apps/web`: `globals.css`, `components.json`,
  `lib/utils.ts`, componentes `button`/`input`/`label`/`card`/`table`/`badge`.
  _Aceitação_: `pnpm --filter web build` limpo; nenhum `"use client"` no app.
  _Depende de_: —

- **T051** — Migrar `/` e `/patients/[patientId]` para o novo cromo, preservando
  `nutri.module.css` só para a visualização de dados (D11). Testes de `lib/format.ts` e
  `lib/nutri.ts` intactos.
  _Aceitação_: as 29 suítes de web verdes sem edição; as duas telas conferidas nos modos claro e
  escuro.
  _Depende de_: T050

- **T052** — `lib/nutri.ts`: as chamadas de escrita (paciente, plano, grafo, catálogo) + casos de
  falha no `explicarFalha` para 409/422.
  _Aceitação_: teste de `explicarFalha` cobrindo 409 e 422.
  _Depende de_: T050

- **T053** — Roster: renomear e excluir paciente + link para os planos.
  _Depende de_: T011, T052

- **T054** — `/patients/[patientId]/plans`: listar, criar, renomear, excluir, ativar plano.
  _Depende de_: T022, T052

- **T055** — `/patients/[patientId]/plans/[planId]`: o editor. Tipos-de-dia, semana, e um
  tipo-de-dia por vez (`?dayType=`) com refeições → opções → itens, cada nó com criar/editar/
  excluir. Erros por código na URL.
  _Depende de_: T033, T041, T054

---

## Fase G — Fechamento

- **T060** — Verificação completa: suítes api/web/core/db/mobile, `lint` 0 errors, `check-types`,
  Prettier, OpenAPI regenerado.
  _Depende de_: T055

- **T061** — Smoke ao vivo (SC-003/SC-005): subir docker + api + web, cadastrar paciente e montar
  um plano inteiro **só pela tela**, ativar, e conferir `GET /patients/:id/today` devolvendo aquele
  plano. `grep` da `NUTRI_API_KEY` no HTML de cada tela nova → 0. Destruir o cenário ao fim.
  _Depende de_: T060

- **T062** — Docs: bloco da 017 no `CLAUDE.md`, `docs/estado-atual.md`, `.env.example` se preciso.
  _Depende de_: T061

---

## Estado final (2026-07-27)

Todas as tasks concluídas. Desvios do plano registrados em `plan.md` → "Correções que a EXECUÇÃO
impôs ao plano" (C1–C6).

Um desvio de ESCOPO, não de plano: a ficha do paciente ganhou **rota própria**
(`/patients/[patientId]/ficha`) em vez de virar um card na tela de acompanhamento (T051). Motivo:
aquela tela tem 424 linhas de visualização com paleta validada (015) e o diff mais curto **e** mais
seguro era não encostar nela — ela só ganhou os três links de navegação. Isso também tornou T051
("migrar `/patients/[patientId]`") uma migração **parcial e deliberada**: só o cromo, nunca o
CSS module dos gráficos (D11).

Resultado medido: **core 181 · db 20 · api 296 · web 38 · api-client 4 · mobile 39** verdes.
Das suítes da API, **126 testes em 6 arquivos** são desta feature (4 e2e + 2 unit).
`tsc` limpo em api e web; `lint` 0 errors (api) e 0 warnings (web, `--max-warnings 0`); Prettier
limpo. OpenAPI regenerado: **14 → 31 paths**.
