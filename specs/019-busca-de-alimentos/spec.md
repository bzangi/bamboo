# Feature Specification: Busca de alimentos (fuzzy) + paginação do catálogo

**Feature Branch**: `019-busca-de-alimentos` (planejada e executada na `main`, padrão 006–018)
**Date**: 2026-07-27
**Origem**: pedido do dono — "pesquisa de alimentos a trocar no lado do paciente + paginação no
endpoint dos alimentos, com fuzzy search".
**Status**: implementada (2026-07-27)

## Por que existe

Dois sintomas do mesmo problema: **lista longa sem como filtrar**.

1. **Paciente.** A auto-classificação (008) pôs ~506 alimentos em ~7 grupos. O sheet de troca
   (`SubstitutionSheet`) despeja **o grupo inteiro** num `ScrollView` sem campo de busca: achar
   "batata doce" entre 70 amidos é rolagem, não "trocar num toque" — o oposto da assinatura do
   produto.
2. **Catálogo (`GET /nutri/foods`).** Tem `limit` (default 50, máx 600) e `total`, mas **não tem
   como pedir a 2ª página**: quem casa a busca além do limite é inalcançável. E o casamento é
   `like '%trecho%'` — substring pura: "arrint" não acha "Arroz integral".

## User Scenarios & Testing

### User Story 1 — O paciente acha o alimento que quer (Priority: P0)

No sheet de troca, o paciente digita parte do nome e a lista de alternativas se reduz ao que casa,
com o mais relevante primeiro.

**Teste de aceitação**

1. **Quando** o paciente digita um trecho, o sistema **deve** manter só as alternativas cujo nome
   casa, ordenadas por relevância.
2. **Quando** o trecho não casa com nada, o sistema **deve** dizer isso — e a mensagem **deve** ser
   distinta de "este grupo não tem alternativas".
3. **Quando** o campo está vazio, o sistema **deve** mostrar todas as alternativas (estado atual).
4. **Quando** o paciente escolhe uma alternativa filtrada, a troca **deve** acontecer como sempre.

### User Story 2 — A busca perdoa (Priority: P0)

Buscar não exige escrever o nome exato: acento, caixa e pedaços faltando no meio não barram.

**Teste de aceitação**

1. **Quando** o termo omite acento ("acai"), o sistema **deve** achar o acentuado ("Açaí").
2. **Quando** o termo é uma **subsequência** do nome ("arrint"), o sistema **deve** achar
   "Arroz integral".
3. **Quando** dois nomes casam, o que casa de forma mais **contígua** e no **início de palavra**
   **deve** vir antes.

### User Story 3 — A nutri alcança a página seguinte (Priority: P1)

`GET /nutri/foods` aceita deslocamento, então o cliente percorre todos os que casaram.

**Teste de aceitação**

1. **Quando** o cliente pede `offset`, o sistema **deve** devolver a fatia a partir dali, com
   `total` inalterado.
2. **Quando** duas páginas consecutivas são pedidas, elas **devem** ser disjuntas e cobrir a ordem
   sem buraco.
3. **Quando** `offset` passa do total, o sistema **deve** devolver lista vazia — não erro.
4. **Quando** `offset` é ausente ou inválido, o sistema **deve** se comportar como hoje (`0`).

### User Story 4 — A lista do paciente carrega conforme ele rola (Priority: P0)

O sheet de troca abre com uma página curta e vai crescendo com a rolagem, em vez de baixar e montar
o grupo inteiro.

**Teste de aceitação**

1. **Quando** o sheet abre, o sistema **deve** trazer só a primeira página (~20 alimentos).
2. **Quando** o paciente chega ao fim da lista, o sistema **deve** buscar e **acrescentar** a página
   seguinte, sem perder a rolagem nem o que já estava na tela.
3. **Quando** a última página chega, o sistema **deve** parar de pedir mais.
4. **Quando** o paciente busca, a consulta **deve** valer sobre **o grupo inteiro** — não só sobre o
   que já foi baixado — e a paginação recomeça no resultado da busca.
5. **Quando** uma página falha, o que já está na tela **deve** permanecer utilizável.

## Requirements

- **FR-001** A busca deve casar por **subsequência** pontuada, insensível a caixa e a acento.
- **FR-002** A régua de busca deve ser **uma só**, compartilhada entre app e API — não duas
  implementações que divergem.
- **FR-003** O resultado deve vir **ordenado por relevância**, com desempate determinístico.
- **FR-004** `GET /nutri/foods` deve aceitar `offset`; `total` continua sendo quantos casaram.
- **FR-005** A **forma** da resposta de `/nutri/foods` não muda (`{ foods, total }`).
- **FR-006** `%` e `_` digitados pelo usuário continuam literais, nunca curinga.
- **FR-007** Nenhum endpoint novo: busca e página entram como parâmetros **opcionais** nos endpoints
  que já existem.
- **FR-008** Nenhum comportamento existente muda: mesmas alternativas, mesmas gramas, mesmo `total`
  para os mesmos termos-substring.
- **FR-009** `GET /meal-items/:id/substitutions` deve aceitar `q`/`limit`/`offset`. **Sem os três, a
  resposta é a de hoje** — o grupo inteiro, na mesma forma.
- **FR-010** A busca do paciente é **do servidor**. Filtrar só o que já baixou daria resultado
  errado: o alimento pode estar na página que ainda não veio.
- **FR-011** O fim da lista deve ser detectável **sem** campo de total na resposta.

## Success Criteria

- **SC-001** Suítes existentes verdes (core 166 · api 291 · mobile 27 · db 20 · web 29).
- **SC-002** "acai" acha "Açaí"; "arrint" acha "Arroz integral"; ambos por teste.
- **SC-003** Duas páginas de `/nutri/foods` são disjuntas e o `total` é o mesmo nas duas.
- **SC-004** `offset` além do total ⇒ `{ foods: [], total: N }`, status 200.
- **SC-005** Duas páginas de `/meal-items/:id/substitutions` se emendam sem repetir nem pular, e
  `offset` no fim devolve `[]`.
- **SC-006** `pnpm lint`, Prettier e `check-types` limpos; OpenAPI regenerado.
- **SC-007** A requisição sem `q`/`limit`/`offset` continua devolvendo o grupo inteiro (as suítes da
  001/010/018 passam sem alteração).

## Fora de escopo (decisão)

- **Tolerância a erro de digitação** ("arros" → "arroz"). Isso pede distância de edição
  (Levenshtein/trigrama) e um **limiar** para calibrar; subsequência não resolve e afrouxá-la só
  produz ruído. Passo natural quando aparecer reclamação: `pg_trgm` no servidor.
- **Buscar fora do grupo** no lado do paciente. Substituição é dentro do grupo por definição
  (é o que preserva o nutriente-base); um campo que acha "pizza" no grupo dos amidos mentiria.
- **Paginação por cursor**. `offset` sobre ~600 linhas é o custo de nada; cursor é para quando a
  base crescer uma ordem de magnitude.
- **Campo `total` na resposta de substituições.** "Página menor que o `limit`" já encerra a rolagem;
  o preço é uma requisição extra quando o grupo é múltiplo exato do tamanho da página.
- **Consumir a paginação de `/nutri/foods` na web.** A tela do editor é da 017, em curso; o
  parâmetro está pronto e documentado para quando ela trocar o `<select>` de 600 opções.
- **Histórico / "trocas frequentes"** no topo da lista. Precisa de dado que ninguém guarda ainda.
- **Busca no `/today`** (achar refeição/item). Outro problema, outra tela.
