# Tasks: Cadastrar paciente

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Baseline** (2026-07-26, HEAD `400782a`): api **158** · core **164** · db **20** · mobile **24** ·
web **29**.

**Git**: commits direto na `main`, caminhos explícitos.

---

## Phase 1: Endpoint (test-first)

- [x] **T001** **[TDD — escrever e VER FALHAR]** `apps/api/test/nutri-criar-paciente.e2e-spec.ts`:
      403 sem chave · 400 em nome ausente/vazio/só-espaço/não-string · 201 com a forma do item da
      listagem · `trim` · homônimos aceitos · aparece no `GET` · `plan`/`cycle`/`day_schedule`
      intactos (FR-006). Cleanup por id coletado.
- [x] **T002** `patients.service.criar()` + `@Post('patients')` no controller: validação estrutural
      na borda, resolução da nutricionista com recusa orientada em 0 e em >1 (D2), resposta 201 no
      formato do item da listagem (D3).
- [x] **T003** OpenAPI regenerado.

**Checkpoint**: dá para cadastrar paciente por HTTP.

---

## Phase 2: A tela

- [x] **T004** `createPatient` em `apps/web/lib/nutri.ts` (server-only, mesma credencial).
- [x] **T005** Server Action + `<details><form>` no roster + `searchParams.erro` traduzido de
      código para frase (D6/D7) + estilo no CSS module.
- [x] **T006** Verificação ao vivo: cadastrar pela tela, o paciente aparece na lista; nome inválido
      mostra a frase e não cria nada; credencial errada mostra a frase de recusa.

---

## Phase 3: Fechamento

- [x] **T007** Suítes: api 158 → **165** · web 29 · core 164 · db 20 · mobile 24. Lint, Prettier,
      `check-types`.
- [x] **T008** Docs: bloco no `CLAUDE.md`, `docs/estado-atual.md`, e o limite do `seed` registrado.
