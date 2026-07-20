# Research — 011-relatorio-de-ciclo

Decisões da fase 0. O conteúdo do relatório veio do dono (2026-07-20): adesão + padrão de
troquei/pulei + evolução semanal + comparativo; JSON por enquanto. **A1–A3 são os defaults a
ratificar no gate**; o resto é decisão técnica.

## D1 (=A1) — Semana relativa ao início do ciclo (PRO GATE)

- **Decision**: semana N = dias `[início + 7(N−1), início + 7N)`, relativa ao `startedOn`;
  a última fatia pode ter < 7 dias e vem marcada `parcial: true`.
- **Rationale**: o ciclo é o eixo do acompanhamento — "semana 2 do ciclo" é a linguagem da
  consulta de retorno; semana-calendário criaria semana 1 fantasma de 2 dias quando o ciclo
  abre numa quinta e desalinharia ciclos entre si.
- **Alternatives considered**: semana-calendário (seg–dom) — rejeitada acima; fatia
  configurável (7/14 dias) — YAGNI, nada pede.

## D2 (=A2) — Ciclo aberto ⇒ relatório parcial válido (PRO GATE)

- **Decision**: `closedOn == null` ⇒ janela efetiva = `startedOn → hoje` (convenção de
  "hoje" da 006), resposta marcada `aberto: true`; dias futuros da duração prevista não
  entram em nada.
- **Rationale**: acompanhar DURANTE o ciclo é a tese do produto (nutri intervém antes do
  fim); a 007 já trata ciclo aberto como janela corrente no detalhe.
- **Alternatives considered**: só ciclo fechado — empurraria o valor pro fim e contradiz o
  "ciclo de acompanhamento"; snapshot congelado ao fechar — exigiria persistência (viola
  FR-008 e a decisão antiga "relatório é derivado").

## D3 (=A3) — Definição de "ciclo anterior" (PRO GATE)

- **Decision**: entre os ciclos do paciente com `closedOn ≤ startedOn` do consultado, o de
  `closedOn` mais recente; desempate (fechados no mesmo dia): o aberto mais recentemente —
  o MESMO desempate do `atribuirCiclo` da 007 (fronteira fechou-e-reabriu).
- **Rationale**: é o ciclo cuja história termina mais perto do início do atual — o
  comparativo natural de evolução; desempate coerente com a régua existente evita duas
  noções de "mais recente".
- **Alternatives considered**: anterior por `startedOn` — quebraria com ciclos curtos
  sobrepostos historicamente; comparar com "melhor ciclo" — feature de ranking, fora do v0.

## D4 — Uma régua só: consumir a `serie()` da 006, nunca recalcular

- **Decision**: o service do relatório obtém a série diária chamando o
  `AdesaoService.serie(patientId, from, to)` (006) para a janela de cada ciclo; as
  agregações puras do core recebem esses dias prontos.
- **Rationale**: FR-003/FR-009/SC-002 — qualquer segunda fórmula divergiria com o tempo; a
  serie já resolve alvo por snapshot/fallback (Q3-B da 006), faixa, saturação e cobertura
  com loader batch sem N+1.
- **Alternatives considered**: recomputar no relatório direto do core — duplicaria a casca
  inteira da 006 (loaders de consumo/alvo) sem ganho; ler `meal_event` cru e reagregar —
  idem, e quebraria a consistência testada.

## D5 — Módulo de composição `apps/api/src/relatorio/`

- **Decision**: módulo Nest próprio importando `AdesaoModule` + `CicloModule` (services
  exportados), controller sob `@Controller('nutri')` com o `NutriKeyGuard` compartilhado
  (`apps/api/src/nutri/`).
- **Rationale**: relatório = composição de adesão + ciclo; não pertence a nenhum dos dois
  (inflar `ciclo/` acoplaria a 007 à 006); guard já é compartilhado desde a 007.
- **Alternatives considered**: endpoint dentro de `ciclo/` — acoplamento; app separado —
  absurdo no v0.

## D6 — Loader de "refeições esperadas por dia" (positions + nomes)

- **Decision**: `relatorio.loader.ts` novo, batch: resolve o tipo-de-dia do alvo de cada dia
  da janela pela MESMA regra da 006 (snapshot dos registros; fallback `day_schedule`) e
  devolve as refeições (position + nome) daquele tipo. Base: extrair/reusar o
  `carregarTipoAlvo` hoje privado no `adesao.service` — refactor sem mudança de
  comportamento (e2e da adesão é a rede).
- **Rationale**: o padrão por refeição precisa do denominador "esperado" por position
  (sem-registro = esperado − estado vigente); a adesão já calcula o tipo do alvo por dia —
  regra única.
- **Alternatives considered**: contar sem-registro só no total (cobertura invertida) —
  perderia o insight "qual refeição ele pula", que é o pedido explícito do dono; duplicar a
  query do tipo-alvo no loader novo — plano B declarado se a extração crescer.

## D7 — e2e self-contained: paciente próprio + cleanup total

- **Decision**: `relatorio.e2e-spec.ts` cria um paciente-cenário exclusivo (plano, tipos,
  refeições, ciclos, meal_events) no `beforeAll` e **deleta tudo em ordem reversa de FK no
  `afterAll`**; nunca usa o paciente do seed compartilhado.
- **Rationale**: lição a2894f3/KI-001 (estado vazado entre suítes = flakiness); pior aqui: o
  índice único parcial de 1-ciclo-ativo/paciente faria a suíte colidir com `ciclo.e2e` se
  compartilhassem paciente.
- **Alternatives considered**: reusar o paciente do seed com cleanup — frágil (qualquer
  esquecimento vaza); truncate global — destruiria o baseline das outras suítes
  (`fileParallelism:false` não salva de estado persistente).

## D8 — Janela acima do teto (366 dias) ⇒ 422 orientado

- **Decision**: janela efetiva do ciclo > 366 dias ⇒ `422 Unprocessable` com mensagem
  orientando (fechar o ciclo/abrir um novo); não é `400` porque não há query do usuário a
  validar — a janela deriva do próprio ciclo.
- **Rationale**: mantém o teto da 006 (mesma classe de limite) sem truncar silenciosamente
  (truncar mentiria no relatório); caso degenerado — ciclo é aberto com duração prevista e
  fechado pela nutri.
- **Alternatives considered**: truncar em 366 — dado mentiroso; sem teto — janela
  arbitrária explode o custo da serie e diverge da 006.

## D9 — Sem-registro e anulados

- **Decision**: por (dia, position): estado vigente ∈ {feito, troquei, pulei} conta no
  respectivo; ausência de estado vigente (nunca registrado OU anulado/desfeito) conta como
  **sem-registro**. Nenhuma distinção "anulado vs nunca registrado" no v0.
- **Rationale**: é a régua do estado vigente da 003/007 (anulados não aparecem); distinção
  extra não tem consumidor no relatório v0.
- **Alternatives considered**: expor anulações — telemetria de comportamento, YAGNI v0.
