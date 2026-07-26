# Feature Specification: Visão da nutri — a parte essencial

**Feature Branch**: `015-visao-da-nutri` (planejada e executada na `main`, padrão 006–013)
**Date**: 2026-07-26
**Origem**: EP-6 (UI da nutri) — primeiro corte, o mínimo que torna o EP-5 utilizável
**Status**: implementada (2026-07-26)

## Por que existe

O EP-5 (Acompanhamento) está **concluído e invisível**. Existem 4 vias `/nutri/*` prontas —
adesão (006), ciclo (007), relatório de ciclo (011) — e **zero consumidores**: `apps/web` é o
boilerplate do `create-turbo`. Hoje a única forma de a nutri ver o relatório que a 011 entregou
é `curl` com `x-nutri-key`. A feature que vende não vende de dentro do terminal.

Falta também a **porta de entrada**. Todas as rotas da nutri são
`/nutri/patients/:patientId/...`: sem uma listagem, é impossível chegar a um paciente sem já
saber o UUID dele. É o único pedaço de API que a tela exige e que não existe.

Escopo deliberadamente estreito: **ver**. A nutri já tem `POST` de abrir/fechar ciclo e trocar
plano ativo; nenhum deles entra nesta tela (ver _Fora de escopo_).

## User Scenarios & Testing

### User Story 1 — Ver os pacientes e quem está em ciclo (Priority: P0)

A nutri abre a web e vê seus pacientes em uma lista, cada um com o estado do acompanhamento
(em ciclo desde quando, ou sem ciclo). Um clique leva ao paciente.

**Por que P0**: é a porta de entrada. Sem ela nada mais é alcançável.

**Teste de aceitação**

1. **Quando** existem pacientes, o sistema **deve** listá-los em ordem alfabética estável, com
   nome e o ciclo atual de cada um.
2. **Quando** o paciente tem ciclo aberto, o sistema **deve** marcá-lo como aberto e informar
   desde quando e a duração prevista.
3. **Quando** o paciente nunca teve ciclo, o sistema **deve** dizer isso explicitamente — nunca
   um espaço em branco.
4. **Quando** o paciente tem só ciclos fechados, o sistema **deve** oferecer o mais recente
   (é o relatório que a nutri quer ler).

### User Story 2 — Ler o ciclo de um paciente (Priority: P0)

A nutri abre um paciente e lê, sem interagir com nada: adesão média do ciclo, quantos dias
tiveram registro, como o paciente registrou (feito / troquei / pulei / sem registro) no total e
por refeição, a evolução semana a semana e, quando existe, a comparação com o ciclo anterior.

**Por que P0**: é o valor do EP-5. Tudo já é calculado pela API — a tela só precisa mostrar.

**Teste de aceitação**

1. **Quando** o ciclo tem dado, o sistema **deve** mostrar a adesão média do ciclo como número
   dominante da tela, com os dias com/sem registro ao lado.
2. **Quando** o ciclo está aberto, o sistema **deve** anunciar que o retrato é parcial
   (início → hoje).
3. **Quando** uma semana do ciclo é incompleta, o sistema **deve** marcá-la como parcial em vez
   de deixá-la parecer uma semana cheia.
4. **Quando** uma semana não tem nenhum registro, o sistema **deve** exibi-la vazia — a semana
   não desaparece da série.
5. **Quando** existe ciclo anterior, o sistema **deve** mostrar os deltas com sinal e direção
   (melhorou / piorou), sem inventar número quando o delta é `null`.
6. **Quando** um valor é `null` (sem dado), o sistema **deve** mostrar "—", nunca `0`.

### User Story 3 — Estados vazios e de falha que orientam (Priority: P1)

A tela nunca mostra stack trace nem tela branca: diz o que aconteceu e qual é o próximo passo.

**Teste de aceitação**

1. **Quando** o paciente não tem nenhum ciclo, o sistema **deve** explicar que o acompanhamento
   começa ao abrir o ciclo na consulta.
2. **Quando** a credencial da nutri não está configurada, o sistema **deve** dizer exatamente
   isso (e qual variável falta), não "erro 403".
3. **Quando** a API não responde, o sistema **deve** mostrar o endereço que tentou e que a API
   pode estar fora — o diagnóstico em uma frase.

## Requirements

- **FR-001** O sistema deve expor uma listagem de pacientes na via da nutri, protegida pela
  mesma credencial das demais rotas `/nutri/*` (fail-closed).
- **FR-002** Cada paciente da listagem deve trazer `id`, `name` e o **ciclo atual**: o ciclo
  aberto se houver; senão o fechado mais recente; senão nulo.
- **FR-003** A listagem deve ser determinística (ordem por nome, desempate por `id`).
- **FR-004** A listagem **não** deve trazer dado pessoal além de nome (sem e-mail, telefone,
  peso, altura) — minimização (LGPD).
- **FR-005** A listagem **não** deve calcular adesão nem qualquer métrica: a tela do paciente é
  quem lê o relatório.
- **FR-006** A tela deve renderizar no servidor. A credencial da nutri **nunca** pode ser
  enviada ao navegador.
- **FR-007** A tela do paciente deve apresentar o relatório do ciclo atual exatamente como a
  API o devolve — **nenhuma régua nova, nenhum recálculo** (só formatação de escala e sinal).
- **FR-008** Nenhuma escrita: a tela é somente leitura. Nada persiste, nada muda de estado.
- **FR-009** Toda derivação de apresentação (escala, sinal, largura de barra, escolha do ciclo a
  exibir) deve ser função pura testável.
- **FR-010** Nenhum endpoint existente pode mudar de forma, valor ou status.

## Success Criteria

- **SC-001** `GET /nutri/patients` sem `x-nutri-key` → 403; com a chave → 200 com a lista.
- **SC-002** Um paciente com ciclo aberto aparece com `cicloAtual.aberto = true` e o `id` do
  ciclo aberto; um paciente sem ciclo aparece com `cicloAtual = null`.
- **SC-003** Um paciente com dois ciclos fechados devolve o de `closedOn` mais recente.
- **SC-004** `git diff` vazio nos `*.e2e-spec.ts` pré-existentes e nas contagens de teste
  existentes (core, mobile) — FR-010.
- **SC-005** Nenhum `NUTRI_API_KEY` aparece no HTML/JS servido ao navegador (grep no output).
- **SC-006** As funções de apresentação têm teste unitário cobrindo: escala 0–100 vs 0–1, delta
  `null`, delta negativo, semana parcial, semana sem dado.
- **SC-007** `pnpm lint` e Prettier limpos; `check-types` verde nos 3 apps.

## Fora de escopo (decisão, não esquecimento)

- **Abrir/fechar ciclo e trocar plano ativo** pela tela. Já existem como `POST`; são **atos**
  da consulta, e a tela desta feature é de **leitura**. Entram no próximo corte do EP-6.
- **Editor de plano** (commodity — tese central), agenda, prontuário.
- **Auth real / login.** A credencial stub (`NUTRI_API_KEY`) dá o papel "nutri do sistema": a
  listagem devolve todos os pacientes, sem escopo por nutri responsável. É o mesmo limite v0 já
  declarado no plan da 006, herdado aqui — não é regressão nem decisão nova.
- **Adesão na listagem.** Custaria N relatórios por render. O número vive na tela do paciente.
- **Escolher período / navegar ciclos antigos.** O relatório já fatia por semana; a listagem já
  aponta o ciclo relevante. Um seletor de ciclo é o próximo corte.
- **Biblioteca de gráficos.** As duas visualizações (evolução semanal, padrão de registro) são
  CSS sobre os números que a API já devolve.
- **`GET /nutri/patients/:id`** (paciente isolado). A tela do paciente resolve nome + ciclo
  relendo a listagem: um endpoint a menos e a regra de "qual ciclo mostrar" em um só lugar.
