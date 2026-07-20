# Feature Specification: Relatório de ciclo

**Feature Branch**: `011-relatorio-de-ciclo` (planejada na `main` — padrão 006–008/010)

**Created**: 2026-07-20

**Status**: Draft — aguardando gate Specify→Plan (Bruno)

**Input**: User description: "Relatório de ciclo — a nutri vê, por ciclo de acompanhamento, adesão, padrão de troquei/pulei, evolução semana a semana e comparativo com o ciclo anterior; JSON pela API, só via da nutri."

## Contexto

É **a feature que vende** (tese: diferenciar no ciclo de acompanhamento) e fecha o EP-5.
Estava destravada desde 006 (métrica de adesão) + 007 (ciclo como objeto). O relatório é a
composição das duas: pega a janela do ciclo (007), aplica a régua de adesão (006) e o padrão
de registro (003), e devolve o retrato de **como o plano sobreviveu à vida real** — que é o
que a nutri não consegue montar sozinha entre consultas.

Conteúdo decidido pelo dono (2026-07-20): **adesão + padrão de troquei/pulei + evolução
semana a semana + comparativo com o ciclo anterior; JSON pela API por enquanto** (sem UI/PDF).

Princípio herdado e inegociável: **o paciente nunca vê nada disso** (régua da 006 — adesão é
instrumento clínico da nutri; ao paciente, ação, não número).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - O retrato do ciclo (adesão + padrão de registro) (Priority: P1)

A nutri consulta o relatório de um ciclo específico do paciente e recebe, numa chamada única:
a **adesão agregada** do ciclo (mesma régua da métrica diária que ela já consulta — média dos
dias com dado, cobertura, distribuição dentro/fora da faixa, macros que mais saíram da faixa)
e o **padrão de registro**: quantas refeições foram feitas, trocadas, puladas e ficaram sem
registro no ciclo, no total e **por refeição** (café/almoço/jantar… — "qual refeição esse
paciente mais pula?" é o insight acionável da consulta de retorno).

**Why this priority**: é o miolo do valor — sem o retrato agregado não existe relatório. As
demais stories decoram este esqueleto.

**Independent Test**: com um paciente semeado com ciclo e registros conhecidos, consultar o
relatório e conferir agregados contra os dados; um ciclo sem registros devolve relatório
válido "sem dado" (nunca erro). Não depende de US2/US3.

**Acceptance Scenarios**:

1. **Given** um ciclo fechado com registros (feito/troquei/pulei) e dias sem registro,
   **When** a nutri consulta o relatório desse ciclo, **Then** recebe a janela do ciclo
   (início, fim, duração prevista), a adesão agregada (média dos dias com dado, cobertura,
   contagem de dias com/sem dado, frequência de cada macro fora da faixa) e o padrão de
   registro (totais por estado + quebra por refeição), tudo consistente com os dados.
2. **Given** um ciclo **aberto**, **When** a nutri consulta o relatório, **Then** recebe o
   retrato **parcial** (do início até hoje), claramente marcado como ciclo em andamento —
   acompanhar DURANTE o ciclo é parte da tese, não caso de erro.
3. **Given** um ciclo recém-aberto sem nenhum registro, **When** a nutri consulta, **Then**
   recebe relatório válido com adesão "sem dado" e padrão zerado — nunca erro (mesma régua
   do "sem-dado" da métrica de adesão).
4. **Given** os valores diários de adesão que a consulta de adesão da 006 devolve para o
   mesmo período, **When** comparados com o relatório, **Then** os agregados batem — é a
   MESMA régua, não uma segunda fórmula.
5. **Given** uma requisição sem a credencial da nutri (ou vinda dos fluxos do paciente),
   **When** consulta o relatório, **Then** o acesso é negado — e nenhuma resposta de
   endpoint do paciente passa a carregar relatório/adesão.

---

### User Story 2 - Evolução semana a semana (Priority: P2)

Dentro do mesmo relatório, a nutri vê a **série semanal**: para cada semana do ciclo
(relativa ao início — semana 1 = dias 1–7), a adesão média da semana, os dias com dado e as
contagens de estados de registro. É o que mostra tendência ("começou firme, degringolou na
semana 3") em vez de um número único que esconde a história.

**Why this priority**: transforma o retrato em narrativa de acompanhamento — mas depende do
esqueleto da US1 pra existir.

**Independent Test**: ciclo semeado com padrões diferentes por semana; a série reflete cada
semana; última semana parcial marcada como parcial.

**Acceptance Scenarios**:

1. **Given** um ciclo de 3 semanas com adesões distintas por semana, **When** a nutri
   consulta o relatório, **Then** a série semanal traz uma entrada por semana em ordem, cada
   uma com o intervalo de datas, adesão média da semana (ou "sem dado"), dias com dado e
   contagens por estado.
2. **Given** um ciclo cuja janela não fecha múltiplo de 7 (duração 17 dias, ou aberto há 10),
   **When** consulta, **Then** a última semana aparece com o intervalo real (menor que 7
   dias) e marcada como **parcial**.
3. **Given** um ciclo aberto, **When** consulta, **Then** a série cobre só do início até
   hoje — semanas futuras da duração prevista não aparecem.
4. **Given** uma semana inteira sem registros, **When** consulta, **Then** a semana aparece
   na série (com adesão "sem dado" e estados zerados) — buraco é informação, não omissão.

---

### User Story 3 - Comparativo com o ciclo anterior (Priority: P3)

O relatório traz, quando existe, o **ciclo anterior** do paciente com as mesmas métricas
agregadas e os **deltas** (adesão média, cobertura, taxas de feito/troquei/pulei) — "melhorou
ou piorou em relação ao ciclo passado?" sem a nutri abrir dois relatórios e comparar deolho.

**Why this priority**: valor incremental sobre US1 — só faz sentido com o agregado pronto, e
só aparece a partir do segundo ciclo do paciente.

**Independent Test**: paciente com dois ciclos semeados → comparativo presente com deltas
corretos; paciente com um ciclo → comparativo ausente sem erro.

**Acceptance Scenarios**:

1. **Given** um paciente com um ciclo fechado anterior ao ciclo consultado, **When** a nutri
   consulta o relatório, **Then** o comparativo identifica o ciclo anterior (janela) e traz
   as métricas agregadas dele + os deltas em relação ao atual.
2. **Given** o primeiro ciclo do paciente, **When** consulta o relatório, **Then** o
   comparativo vem ausente/nulo — sem erro, sem bloco vazio enganoso.
3. **Given** um ciclo anterior sem nenhum dia com dado, **When** consulta, **Then** o
   comparativo aparece com as métricas do anterior "sem dado" e deltas nulos (não inventa
   zero).

---

### Edge Cases

- **Troca de plano no meio do ciclo** (vigências da 007): a adesão diária já resolve o alvo
  de cada dia pela régua da 006 (snapshot do registro; fallback programação do dia) — o
  relatório **não cria régua nova**, herda o comportamento.
- **Registros anulados (desfeitos)**: seguem invisíveis — só o estado vigente conta (regra
  da 003/007).
- **Ciclo de outro paciente / inexistente**: recusa como "não encontrado" (mesma régua do
  detalhe de ciclo da 007).
- **Dias futuros de ciclo aberto**: não entram em nada (nem denominadores, nem semanas).
- **Ciclo fechado no mesmo dia em que abriu** (auto-fechamento da 007): janela de 1 dia;
  semana única parcial de 1 dia.
- **Dois ciclos anteriores fechados no mesmo dia**: desempate determinístico (mais recente
  pela ordem de abertura — coerente com o desempate de fronteira da 007).
- **Período do ciclo muito longo**: o relatório respeita o mesmo teto de período da consulta
  de adesão (366 dias); ciclo com janela maior é truncado? NÃO — ciclo é criado com duração
  obrigatória e fechado pela nutri; janela real acima do teto é caso degenerado e responde
  como inválido, com mensagem orientando (mesma classe do 400 da 006).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: O sistema MUST expor o relatório de um ciclo específico do paciente **somente
  na via da nutri** (mesma proteção fail-closed da 006/007); requisições sem a credencial
  MUST ser negadas, e nenhuma superfície do paciente MUST ganhar qualquer campo do relatório.
- **FR-002**: O relatório MUST trazer a janela do ciclo (início, fim ou "em andamento",
  duração prevista) e MUST funcionar para ciclo **fechado** (janela completa) e **aberto**
  (parcial, início→hoje, marcado como em andamento).
- **FR-003**: A adesão agregada MUST usar a MESMA régua da métrica diária da 006 (média
  aritmética dos dias com dado; dias sem dado nunca viram 0%), e MUST expor: média do ciclo
  (ou "sem dado"), contagem de dias com/sem dado, cobertura agregada, distribuição
  dentro/fora da faixa e frequência de cada macro fora da faixa.
- **FR-004**: O padrão de registro MUST contar, na janela do ciclo, os estados vigentes por
  refeição-dia — **feito, troquei, pulei e sem-registro** — no total do ciclo e por refeição
  (posição no dia, com nome legível), sem contar registros anulados.
- **FR-005**: A evolução MUST ser **semana a semana, relativa ao início do ciclo** (semana 1
  = dias 1–7; nunca semana-calendário), cada semana com intervalo de datas, adesão média,
  dias com dado e contagens por estado; a última semana truncada pela janela MUST vir marcada
  como parcial; semanas sem dado MUST aparecer (não sumir da série).
- **FR-006**: O comparativo MUST identificar o **ciclo anterior** = o ciclo do paciente,
  já terminado, com fim mais recente anterior ao início do ciclo consultado (desempate:
  aberto mais recentemente); MUST trazer as métricas agregadas do anterior + deltas
  (atual − anterior) para adesão média, cobertura e taxas por estado; sem ciclo anterior,
  o comparativo MUST vir ausente/nulo (nunca erro); anterior sem dado ⇒ deltas nulos.
- **FR-007**: Ciclo sem registros (ou recém-aberto) MUST produzir relatório válido com
  adesão "sem dado" e contagens zeradas — nunca erro.
- **FR-008**: O relatório MUST ser **derivado**: a consulta não persiste nada (estado do
  banco idêntico antes/depois) e não existe tabela de relatório (decisão de modelagem
  mantida).
- **FR-009**: Consistência: para a mesma janela, os valores diários subjacentes ao relatório
  MUST ser idênticos aos da consulta de adesão da 006 (uma régua só).
- **FR-010**: Erros: ciclo inexistente ou de outro paciente ⇒ não encontrado; janela real
  do ciclo acima do teto de período vigente (366 dias) ⇒ inválido com mensagem orientada;
  credencial ausente/errada ⇒ negado.

### Key Entities

Nenhuma entidade nova e nada persistido. O relatório é **agregado derivado** de:

- **Ciclo** (007): janela (início/fim/duração prevista) + vigências de plano.
- **Registros** (003): estados vigentes por (dia, refeição) na janela.
- **Adesão diária** (006): valor/classificação/flags/cobertura por dia — a régua reutilizada.
- **Semana do ciclo** (novo conceito, só de apresentação): fatia de 7 dias relativa ao
  início; a última pode ser parcial.
- **Comparativo** (novo conceito, só de apresentação): par (ciclo consultado, ciclo
  anterior) + deltas dos agregados.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A nutri obtém o retrato completo de um ciclo (adesão, padrão, evolução,
  comparativo) em **1 chamada**, para qualquer ciclo do paciente, aberto ou fechado.
- **SC-002**: Consistência de régua: em 100% dos dias da janela, o valor diário implícito no
  relatório é idêntico ao da consulta de adesão da 006 para o mesmo dia.
- **SC-003**: Zero exposição ao paciente: nenhuma resposta dos endpoints do paciente muda
  (byte a byte) com a feature; 100% das chamadas sem credencial da nutri são negadas.
- **SC-004**: Ciclo sem dados responde relatório válido (nunca erro) em 100% dos casos.
- **SC-005**: Comparativo correto: presente exatamente quando existe ciclo anterior
  terminado antes do início do atual; deltas = atual − anterior nos agregados definidos.
- **SC-006**: A consulta do relatório não escreve nada: estado do banco idêntico
  antes/depois (mesma invariante da 006).
- **SC-007**: Zero regressão: todas as suítes existentes seguem verdes.

## Assumptions

Defaults recomendados, a ratificar no gate Specify→Plan:

- **A1 — Semanas relativas ao início do ciclo** (semana 1 = dias 1–7), não
  semana-calendário; última semana parcial marcada. (Alternativa rejeitada: semanas
  seg–dom criam semana 1 fantasma quando o ciclo abre numa quinta.)
- **A2 — Relatório de ciclo aberto é parcial e válido** (início→hoje, marcado "em
  andamento") — acompanhar durante o ciclo é a tese; não é erro nem bloqueado.
- **A3 — "Ciclo anterior"** = ciclo do paciente já terminado com fim mais recente anterior
  ao início do consultado; desempate pelo aberto mais recentemente (coerente com a 007).
- A régua de adesão (fórmula, saturação, faixa, cobertura, tipo-de-dia do alvo) é a da 006,
  intocada — o relatório agrega, não recalcula diferente.
- Nome legível da refeição na quebra por posição: melhor esforço a partir do plano vigente
  na janela (posições pareiam entre tipos de dia — régua da 006); empate de nomes não é caso
  de erro.
- Credencial v0 = a mesma chave única da nutri (006); escopo por nutri responsável entra com
  a auth real (EP-3), fora daqui.

## Out of Scope

- **UI web da nutri** (EP-6 — o relatório nasce API-first, seed-first).
- **PDF/export/impressão** (formato decidido: JSON por enquanto).
- **Comparativo entre pacientes**, ranking, benchmarks.
- **Metas custom por ciclo** (a faixa/tolerância segue a régua vigente da 006).
- **Qualquer exposição ao paciente** (número, resumo, badge — nada).
- **Notificações/alertas** sobre o relatório (EP-7).
- **Auth real por nutri** (EP-3 — transversal, entra com a web).
