# Feature Specification: Cadastrar paciente

**Feature Branch**: `016-cadastro-de-paciente` (planejada e executada na `main`, padrão 006–015)
**Date**: 2026-07-26
**Origem**: lacuna apontada pelo dono depois da 015 — "ainda não temos endpoints pra inserir pacientes e planos?"
**Status**: implementada (2026-07-26)

## Por que existe

Depois da 015 a nutri tem uma tela que **lê** seus pacientes, mas o único jeito de um paciente
existir é rodar `packages/db/scripts/seed.ts` — um script destrutivo, que apaga a nutricionista e
os pacientes antes de recriar. Não há como acrescentar um paciente sem apagar o resto.

Escopo estreito de propósito: **um** paciente com **nome**. O plano continua fora (ver
_Fora de escopo_) — é o grafo de 6 tabelas que o roadmap resolve por import de PDF na Fase 4, não
por editor à mão.

## User Scenarios & Testing

### User Story 1 — Cadastrar um paciente (Priority: P0)

A nutri digita o nome e o paciente aparece na lista, sem ciclo, pronto para receber plano e ciclo.

**Teste de aceitação**

1. **Quando** o nome é válido, o sistema **deve** criar o paciente e devolvê-lo já na forma do
   item da lista (id, nome, `cicloAtual: null`), com status 201.
2. **Quando** o nome vem vazio, só com espaços, ausente ou não-string, o sistema **deve** recusar
   com 400 e não criar nada.
3. **Quando** o nome tem espaços nas pontas, o sistema **deve** guardar o nome sem eles.
4. **Quando** dois pacientes têm o mesmo nome, o sistema **deve** aceitar — homônimo é real, e
   nada no schema diz o contrário.
5. **Quando** a credencial da nutri falta ou está errada, o sistema **deve** negar com 403 antes
   de qualquer escrita.
6. **Quando** o paciente é criado, ele **deve** aparecer na listagem em `GET /nutri/patients`.

### User Story 2 — Cadastrar sem sair da tela (Priority: P1)

Na lista de pacientes existe um campo para cadastrar. Depois de salvar, a lista já mostra o novo
paciente.

**Teste de aceitação**

1. **Quando** a nutri envia o formulário com nome válido, a lista **deve** recarregar contendo o
   paciente novo.
2. **Quando** o nome é inválido ou a API falha, a tela **deve** dizer o que aconteceu e manter a
   nutri na lista — nunca um 500 nem uma tela branca.

## Requirements

- **FR-001** O sistema deve expor a criação de paciente na via da nutri, sob a mesma credencial
  (fail-closed) das demais rotas `/nutri/*`.
- **FR-002** O corpo aceito é `{ name }`. **Só nome** — minimização (LGPD): e-mail, telefone,
  peso e altura não são coletados porque nada os consome hoje.
- **FR-003** `name` é obrigatório, string, `trim` não-vazio, no máximo 120 caracteres.
- **FR-004** A resposta é o paciente na **mesma forma do item da listagem** (015), com
  `cicloAtual: null`, para o cliente não precisar de uma segunda chamada.
- **FR-005** O paciente é vinculado à nutricionista responsável, resolvida do banco: exatamente
  uma → usa; nenhuma → recusa orientada; mais de uma → recusa orientada, porque a credencial
  stub não distingue qual (limite v0 herdado da 006, não decisão nova).
- **FR-006** Nada além de `patient` é escrito: sem plano, sem ciclo, sem `day_schedule`.
- **FR-007** Nenhum endpoint existente pode mudar de forma, valor ou status.
- **FR-008** A tela nunca envia a credencial ao navegador — a escrita sai do servidor.

## Success Criteria

- **SC-001** `POST /nutri/patients` sem chave → 403; com chave e nome válido → 201.
- **SC-002** Nome vazio/branco/ausente/não-string → 400, e a contagem de `patient` não muda.
- **SC-003** O paciente criado aparece em `GET /nutri/patients` com `cicloAtual: null`.
- **SC-004** Nome com espaços nas pontas é persistido sem eles.
- **SC-005** Depois de um 201, as contagens de `plan`, `cycle` e `day_schedule` não mudam.
- **SC-006** Duas criações com o mesmo nome resultam em dois pacientes distintos.
- **SC-007** `pnpm lint`, Prettier e `check-types` limpos; suítes existentes intactas.

## Fora de escopo (decisão, não esquecimento)

- **Criar plano** (`plan → day_type → meal → meal_option → meal_item` + `day_schedule`).
  Escrever esse payload à mão é pior que rodar o seed, e o `buildScenario` já expressa o grafo de
  forma declarativa. O endpoint nasce quando tiver consumidor de verdade: o **import de PDF por
  IA** da Fase 4, que é o que o roadmap prevê como porta de entrada do plano.
- **Editar/arquivar/excluir paciente**, e-mail/telefone/anamnese, `exposure` pela tela (fica no
  default `hidden` do schema).
- **Cadastrar nutricionista.** Sem auth real não há quem seja o dono da conta; a nutricionista
  continua vindo do seed.
- **Idempotência / anti-duplo-clique.** Homônimo é legítimo, então não há chave natural para
  deduplicar. Se virar problema, é um `Idempotency-Key`, não uma constraint de nome.

## Limite conhecido (documentar, não corrigir)

`packages/db/scripts/seed.ts` **apaga** pacientes e a nutricionista antes de recriar. Um paciente
cadastrado por esta via **não sobrevive** ao próximo `seed`. Não é regressão desta feature — é o
que o seed sempre fez —, mas passa a ser visível agora que existe cadastro fora dele.
