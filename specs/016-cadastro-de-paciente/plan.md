# Implementation Plan: Cadastrar paciente

**Input**: [spec.md](./spec.md) · **Date**: 2026-07-26 · **Status**: implementado

## Resumo técnico

Um `POST` no módulo `nutri` que já existe (015) + um formulário no roster. Um `insert` numa
tabela, nenhuma regra de domínio nova — logo **`packages/core` fica intocado** e não há migration.

## Constitution check

| Princípio                                | Como se comporta                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| III — Functional core / imperative shell | Não há regra de negócio: validar formato de string é **estrutural**, mora na borda. Nada a acrescentar no núcleo — inventar uma função pura `validarNome` em `packages/core` seria cerimônia, não disciplina. |
| IV — SDD/TDD                             | e2e escrito antes do endpoint (visto falhar).                                                                                                                                                                 |
| V — LGPD                                 | Coleta mínima: **só nome** (FR-002). Escrita sob a mesma credencial fail-closed; credencial nunca vai ao navegador.                                                                                           |
| VI — YAGNI                               | 1 endpoint, 1 tabela, 0 dependência nova, 0 migration.                                                                                                                                                        |

## Decisões

- **D1 — Validação manual no service, não `class-validator`.** O repo **não tem**
  `class-validator` nem `ValidationPipe` global; o padrão real (visto em `ciclo.controller.ts`) é
  `@Body() body: { x?: unknown }` + validação no service lançando `BadRequestException`. Adicionar
  a dependência para validar uma string contraria o padrão existente e o Princípio VI. A
  Constitution pede validação estrutural **na borda** — e é onde ela está; a biblioteca é detalhe.
- **D2 — Resolver a nutricionista, com recusa orientada em 0 e em >1.** Nada de
  `LIMIT 1` silencioso: pendurar dado de saúde na nutricionista errada é pior que falhar. Com >1 a
  mensagem diz por quê (a credencial stub não distingue) e o que resolve (auth real).
- **D3 — Resposta = `NutriPatientDto`** (o item da listagem, `cicloAtual: null`). O cliente
  insere na lista sem uma segunda chamada, e não nasce um segundo formato para "paciente".
- **D4 — Sem DTO compartilhado para o corpo.** `{ name }` não paga um tipo em
  `packages/types`; o web monta o corpo no mesmo repo, e o contrato de request está no Swagger.
- **D5 — Server Action + `<form>`, não componente client.** A escrita sai do servidor, então a
  credencial continua onde estava. **Custo assumido:** o roster passa a carregar o runtime de
  Server Actions (deixa de ser 100% zero-JS); sem JS o `<form>` ainda submete. A alternativa
  (Route Handler + redirect) preservava zero-JS ao custo de uma rota e um redirect à mão — não
  vale, e Server Action é o primitivo idiomático do Next 16.
- **D6 — Erro pela URL como CÓDIGO, nunca como texto.** A action redireciona para
  `/?erro=nome-invalido|api`, e a página traduz o código numa frase fixa. Não reflete texto vindo
  de fora, e dispensa `useActionState` (que exigiria componente client).
- **D7 — `<details>` nativo para esconder o formulário.** Colapsado por padrão: a tela continua
  sendo a lista. Zero JS, zero estado.

## Contratos

```
POST /nutri/patients            (header x-nutri-key, fail-closed)
body  { "name": "Ana Ribeiro" }
201 → { id, name, cicloAtual: null }        // = item de GET /nutri/patients
400 → nome ausente/vazio/não-string/>120
403 → credencial ausente ou errada
422 → nenhuma nutricionista cadastrada · mais de uma (stub não distingue)
```

## Onde mora o quê

| Camada      | Arquivo                                     | Mudança                                                            |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------ |
| casca (API) | `apps/api/src/nutri/patients.service.ts`    | `+ criar(name)`: valida, resolve nutricionista, insere, mapeia     |
| casca (API) | `apps/api/src/nutri/patients.controller.ts` | `+ @Post('patients')`                                              |
| casca (web) | `apps/web/lib/nutri.ts`                     | `+ createPatient(name)`                                            |
| UI          | `apps/web/app/page.tsx`                     | Server Action + `<details><form>` + leitura de `searchParams.erro` |
| UI          | `apps/web/app/nutri.module.css`             | estilo do formulário                                               |

## Modelo de dados

Sem migration. `insert into patient (nutritionist_id, name)`; o resto do registro fica nos
defaults do schema (`exposure = 'hidden'`, `created_at = now()`, os demais nulos).

## Estratégia de teste

1. **e2e novo** `apps/api/test/nutri-criar-paciente.e2e-spec.ts`, sem `buildScenario` (o cenário
   aqui é o **efeito** da chamada, não um fixture): 403, os 4 casos de 400, o 201 com forma
   completa, `trim`, homônimos, presença na listagem e — o que fecha FR-006 — contagens de
   `plan`/`cycle`/`day_schedule` idênticas antes e depois. Cleanup: apaga só os pacientes que o
   próprio teste criou (guarda os ids).
2. **Sem teste de componente** (não há harness no repo). O que o formulário deriva é o mapa
   código→frase, trivial e coberto pelo type-check do `Record`.

## Riscos

| Risco                                                                         | Mitigação                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Teste que cria dado real vazar paciente órfão entre suítes (lição KI-001/I-3) | O `afterAll` apaga por id coletado, e nenhuma asserção olha o tamanho da lista.       |
| `seed.ts` apagar o paciente cadastrado                                        | Limite declarado na spec; o seed não é tocado.                                        |
| Server Action mudar a propriedade "zero JS" da 015                            | Declarado em D5 e nos docs; a garantia que importa (credencial no servidor) não muda. |
