# Contrato — HTTP (`apps/api`)

Nenhuma mudança de **request**. Os endpoints existentes passam a ler o registro no servidor. Rebalanceamento segue efêmero. A fonte de data em toda carga de `meal_event` é `localToday()` (mesma do registro e do `/today`), nunca `new Date()`/UTC.

## `POST /patients/:patientId/registro` (mudança na ESCRITA — Fase 3, D3b)

Sem mudança de request. Ao gravar **troquei**, o servidor passa a materializar e gravar em `meal_event_item` o **conjunto COMPLETO** de itens consumidos da refeição (não só os trocados): a opção cumprida com os `consumo.items` sobrepostos por `itemId` (substituição/combinação), ou todos os itens da opção não-default (troquei-por-opção). Torna `consumido(troquei) = soma(meal_event_item)` exato. `feito`/`pulei`/`desfazer` inalterados. **Atualizar os e2e de troquei da Fase 3** (passam a esperar `meal_event_item` = refeição inteira; troquei-por-opção agora também gera linhas).

## `POST /patients/:patientId/rebalance/option-choice` (trocar opção)

**Request**: inalterado (`{ triggerMealId, chosenOptionId }`).

**Comportamento novo** (casca, dentro do fluxo existente):

1. Carregar o estado vigente por refeição do dia (paciente, plano, `logged_date` de hoje) + o consumo real (helper `registro-consumo`).
2. Montar `diaComEscolha`:
   - refeição **registrada** (≠ gatilho) → `itens` = consumo real (feito = opção cumprida planejada; troquei = **soma de `meal_event_item`**, snapshot completo; pulei = `[]`), `isRegistered: true`.
   - refeição **não registrada** → opção default planejada, `isRegistered: false`.
   - **gatilho** → opção escolhida, `isRegistered: false`.
3. `refeicoesDefault` (alvo) = defaults do plano — inalterado.
4. `previewTrocaOpcao(...)` → exclui registradas das alavancas; total reflete o consumido.

**Response**: shape **inalterado**. As `AlavancaAjustada` retornadas só contemplam itens de refeições **não registradas** (e não o gatilho). Recusa orientada (200, "nunca barra") com a mensagem mapeada pelo motivo (D10): `sem-alavanca` / `estoura-piso` no excesso ("hoje ficou acima…") / no déficit ("hoje ficou abaixo…"). Sem total/desvio/percentual ao paciente (FR-015).

**Erros**: inalterados (404 paciente/plano/refeição; 422 entrada inválida do motor).

## `GET /patients/:patientId/today?dayTypeId=<id>` (trocar tipo-de-dia)

**Request**: inalterado.

**Comportamento novo** — **sempre que há `dayTypeId` override ativo** (o paciente está vendo um tipo-de-dia escolhido — o app persiste e reenvia o `?dayTypeId`) **e** há consumo registrado hoje:

1. Computar `consumido` = agregado do consumo real das registradas de hoje (helper `registro-consumo`, por (paciente, plano, `localToday()`), **type-agnostic**).
2. `previewTrocaTipoDia(consumido, refeicoesRestantesNovoTipo = todas do novo tipo, refeicoesDefaultNovoTipo, parametros)`.
3. Aplicar as `AlavancaAjustada` (itemId→gramasNovo+medidaCaseira) **só** aos itens flexíveis da **opção default** exibida, recomputando a `nutrition` pela grama nova; casamento por **`itemId`** (via `today.mapper`).

**Sem `dayTypeId`** (tipo-de-dia padrão por weekday): inalterado — **nunca** auto-ajusta (Q1: registrar/recarregar o padrão não recalcula). Override ativo sem consumo hoje: novo tipo no planejado.

**Response**: shape **inalterado**; os itens flexíveis da opção default vêm com **gramas/medida/nutrition ajustadas** quando houve recompute. As demais opções (alternativas) seguem no planejado. (Indicador visual de "ajustado pelo que você comeu" — deferido; v0 ajusta as gramas direto.)

**Privacidade**: o gate de exposição (já aplicado em `/today`) é mantido; as gramas ajustadas são **ação** (quanto comer), não número de adesão (FR-015).

## Cobertura e2e (test-first, Vitest)

`rebalance.e2e-spec.ts` (adições):
- Registrar uma refeição anterior como **feito**; `POST option-choice` numa posterior → a refeição registrada **não** aparece nos ajustes e sua grama não muda (SC-001).
- Registrar **pulei** numa refeição; `POST option-choice` → o restante é sugerido a **aumentar** (déficit), sem furar o piso (SC-002).
- Registrar **troquei** mais calórico; `POST option-choice` → total reflete o consumo real; restante **reduz** (FR-006).
- Todas as outras registradas → `recusa-orientada` (sem alavanca).

`today-daytype.e2e-spec.ts` (adições):
- Sem consumo: `GET /today?dayTypeId=<outro>` → cardápio do novo tipo no **planejado** (SC-003 baseline).
- Com consumo (ex.: pulei o café): `GET /today?dayTypeId=<outro>` → itens flexíveis do novo tipo com **gramas ajustadas** (≠ planejado), respeitando piso, e o ajuste cai nos itens do **novo** tipo (casamento por itemId) (SC-003).
- **Reload com override ativo**: registrar uma refeição com `?dayTypeId` ativo e recarregar `GET /today?dayTypeId=<mesmo>` → segue ajustado pelo consumido (override ativo = sempre ajustado).
- `GET /today` **sem** `dayTypeId` (tipo padrão) após consumo → **não** ajustado (planejado + badges) — o padrão não auto-recalcula (Q1).
