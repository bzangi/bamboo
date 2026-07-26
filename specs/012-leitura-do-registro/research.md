# Research — Leitura do registro (012)

As 7 decisões vêm do **grilling** de 2026-07-25 (skill `grilling`, sobre o candidato 01 da
revisão de arquitetura). Cada uma foi apresentada ao Bruno com opções e recomendação; todas
ratificadas. Antes do grilling rodou um workflow de 9 agentes: 5 leitores integrais dos 4
modules + consumidores, 1 síntese com 3 desenhos alternativos de interface, e **3 críticos
adversariais** com lentes distintas.

## Os 3 veredictos adversariais

Os três disseram **`unificar-parcialmente`** — nenhum disse "não unificar", nenhum disse
"unificar tudo". Convergiram, independentemente, no mesmo recorte.

| Lente                       | Veredicto             | Objeção mais forte                                                                                                                                                                                                                                          |
| --------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **corretude semântica**     | unificar-parcialmente | Os dois eixos que a unificação mais plausivelmente colapsa — escopo de plano e fonte do plano no fallback — são **invisíveis para a suíte inteira**, então "tudo verde" não é evidência de preservação semântica justamente onde a semântica é intencional. |
| **superfície de teste**     | unificar-parcialmente | **SC-002 da 011 não é oráculo dos loaders e nunca foi**: os dois lados da comparação saem da mesma `AdesaoService.serie`, e `agregarAdesao` recalcula com o mesmo `mediaAdesao`. Unificar não o torna tautológico — ele já é.                               |
| **YAGNI / forma do module** | unificar-parcialmente | São dois conceitos, e a prova está nos args do desenho: `comNutrientes` + `esperadas?` + escopo + fallback = **≥8 modos, 4 usados**. Um module cuja assinatura pergunta "você é o motor ou o relatório?" só moveu o `if` para o call site.                  |

O que os três recortaram igual: **unificar** o pipeline de estado vigente, **unificar** o
bloco de nutrição (o clone medido), **extrair** a janela do ciclo sem `registros`, e **não
tocar** em Q3-B, fonte do fallback, `MAX_DIAS` e pareamento sob override.

---

## D1 — Dois modules empilhados, não um

**Decisão:** um module base de **registro vigente** (5 consumidores) e um de **consumo real**
(3 consumidores) empilhado sobre ele.

**Por quê:** os leitores não são um conceito. `registro-consumo.ts` e `adesao-consumo.ts`
calculam nutrientes; `relatorio.loader.ts` (§1-2) e `ciclo.service.registrosDaJanela` **não**
— o loader do relatório nem importa nada nutricional. O que compartilham é a base.

**Correção da contagem (verificação pós-escrita):** são **5** implementations no caminho de
leitura, não 4. A quinta é a query inline de `plan.service.ts:131-160`, que tem query própria
de `meal_event` **e** redução própria (`:159`) — e é justamente a única sem `ORDER BY` e a
única sem `INNER JOIN meal`. Somando os 2 sites do caminho de escrita
(`registro.service.ts:197`, `:461`), fecham as 7 reduções.

**Alternativa rejeitada — uma função com flags (`comNutrientes`, `esperadas?`):** o tipo
passaria a mentir. `itens: []` e `consumido: zeros` com `comNutrientes:false` são
indistinguíveis de "não comeu nada", exatamente a classe de degradação silenciosa que já
morde. Interface semi-shallow em cima de implementation deep — a complexidade da interface
sobe e a da implementation não cai.

## D2 — `escopo` é union discriminada **obrigatória**

**Decisão:**

```ts
type EscopoPlano =
  | { readonly kind: "plano"; readonly planId: string }
  | { readonly kind: "qualquer-plano" };
```

Sem default, sem `planId?` opcional. Filtro no `WHERE`, não em memória.

**Por quê:** hoje `registro-consumo.ts:77-79` e `adesao-consumo.ts:71-74` filtram por
`planId`; `relatorio.loader.ts:95-101` e `ciclo.service.ts:374-379` não. As duas convenções
são intencionais e produzem, no mesmo `GET /report`, um bloco `registro` que conta todos os
planos e um bloco `adesao` que conta só o ativo.

A distinção que decide a forma: um flag booleano que muda **quais campos vêm preenchidos**
deixa o tipo mentindo — shallow. Um parâmetro obrigatório que muda **quais linhas entram**
não mente, e força cada call site a declarar a intenção. O `tsc` recusa quem esquecer.

**Alternativa rejeitada — base plan-agnostic sem parâmetro, filtro no module de cima:** foi a
primeira escolha do gate, revertida depois da objeção do crítico semântico. Um 5º consumidor
do base herdaria plan-agnostic **em silêncio**, e a suíte é cega ao eixo: fixtures usam **um**
plano (`relatorio.e2e-spec.ts:74-76`, `adesao.e2e-spec.ts:284-290`), então plan-agnostic e
plan-scoped produzem resultado idêntico em 100% dos cenários testados.

## D3 — `eventoVigente` no núcleo, `seq` por índice de query ordenada

**Decisão:** a redução vira função pura no núcleo e devolve a **linha** vencedora. A query
ordena por `(logged_date, created_at, id)` e o `seq` é o **índice** do array ordenado.

```ts
export function eventoVigente<
  T extends { readonly seq: number; readonly state: EstadoRegistro | null },
>(eventos: ReadonlyArray<T>): T | null; // null se vazio OU se o vencedor for tombstone
```

**Por quê:** hoje a redução está em 7 lugares e a casca re-deriva a linha vencedora com
`e.createdAt.getTime() > maior.createdAt.getTime() ? e : maior` em 4 deles, porque
`estadoVigente` devolve só o estado. A interface era estreita demais: devolvia menos do que
já tinha calculado.

**O bug que isso fecha.** `plan.service.ts:152-153` afirma _"seq = ordem total por created_at
(microssegundo); o advisory lock no INSERT garante estritamente crescente"_ — e o `getTime()`
está em `:154`. Postgres guarda `timestamp` em **microssegundo**, mas o `Date` que o driver
devolve **trunca em milissegundo**: `getTime()` joga a resolução fora. E
`plan.service.ts:131-145` é o **único dos 7 sites sem `ORDER BY`** (os outros 6 têm
`orderBy(asc(createdAt))`: `registro-consumo.ts:82`, `adesao-consumo.ts:77`,
`relatorio.loader.ts:102`, `ciclo.service.ts:381`, `registro.service.ts:192` e `:449`), com o
comentário em `:127-128` explicando o porquê: _"o core é robusto à ordem, então não precisa de
DISTINCT ON nem ORDER BY"_ — é esse raciocínio que produziu o bug. Em empate,
`registro.ts:106` (`e.seq > maior.seq`) mantém o primeiro do array, e o primeiro é a ordem
arbitrária do Postgres.

**A premissa do comentário é pior do que parece** (achado da verificação). O advisory lock
**não** garante `created_at` crescente: `created_at` é `DEFAULT now()`
(`migrations/0002_clear_cammi.sql:11`) e o INSERT não passa valor
(`registro.service.ts:366-376`), então vale `transaction_timestamp()` — **fixado no início da
transação, antes** do `pg_advisory_xact_lock` (`:102-104`). Duas transações concorrentes podem
ter o mesmo `now()`, e a que espera o lock pode inserir depois com `created_at` **anterior**.
Ou seja: não é só empate, é **inversão** possível em relação à ordem de inserção. A conclusão
(a ordem não é confiável ⇒ FR-005) fica mais forte; a justificativa original estava errada.

**Por que a assinatura mudou depois do gate.** A versão apresentada no gate tinha 2
parâmetros (`linhas`, `seqOf`) e **não conseguia ver o tombstone** — a regra vazaria de volta
para o chamador, que é o problema que a decisão resolve. Trocada por constraint no tipo, que
é o que os 4 sites já fazem hoje (`map(e => ({seq, state}))`). Correção de erro do desenho,
não mudança de decisão.

**`estadoVigente` não precisa de wrapper de compat.** Depois da migração sobram **2** call
sites, ambos em `registro.service` (`:197`, `:461`), e ambos **já usam `seq = índice`** — a
convenção certa. Então as duas convenções colapsam em uma sem tocar o caminho de escrita.
`estadoVigente` pode ser re-expressa como `eventoVigente(eventos)?.state ?? null`
(comportamento bit-a-bit idêntico: vazio → null; tombstone vencedor → null).

**Alternativa rejeitada — só `ORDER BY`, o último vence, nada novo no núcleo:** mais
preguiçosa e o bug morreria por construção, mas last-write-wins + tombstone é regra de
negócio, e o `CLAUDE.md` é categórico sobre onde regra de negócio mora.

## D4 — `mealId` vs `position` fica fora, documentado

**Decisão:** fora do escopo. O base ordena por `(logged_date, created_at, id)` **preservando
`mealId`** — nunca por `position`. Nenhum consumidor troca de chave. Registrado em
[ADR-0001](../../docs/adr/0001-chave-de-pareamento-sob-override.md) e KI-002.

**Por quê:** padronizar não é refactor, é mudança de produto, nas duas direções. Por
`position` corrige o bug de gramas (a refeição comida sob override não sai das alavancas,
`rebalance.service.ts:294`) **e** muda a contagem de `GET /cycles/:id`. Por `mealId` preserva
o app e muda `report.registro.totais`. Ambas mexem em número que a nutri já viu ou grama que
o paciente já viu.

Fazer isso na mesma leva de um refactor cujo critério é "nenhum número muda" destruiria a
verificabilidade: se algo quebrasse, haveria três causas possíveis.

Ordenar por `position` também colapsaria colisões **em silêncio** — o crítico semântico
mostrou que `registro.totais.feito/pulei/semRegistro` podem inverter num dia em que duas
refeições de tipos-de-dia diferentes ocupam a mesma `position`.

## D5 — Q3-B e o fallback de plano ficam para o candidato 05

**Decisão:** `relatorio.loader.ts` **sobrevive** com ~170 das 233 linhas. Só as ~63 da
leitura de eventos (`:84-146`) migram para o base.

**Por quê:** a conta honesta do que cada leitor perde:

| leitor                            | linhas | destino                                   |
| --------------------------------- | ------ | ----------------------------------------- |
| `registro-consumo.ts`             | 240    | desaparece inteiro                        |
| `adesao/adesao-consumo.ts`        | 225    | vira o `consumo-real.loader` generalizado |
| `ciclo.service.registrosDaJanela` | 55     | absorvido inteiro (o sort fica no ciclo)  |
| `relatorio.loader.ts`             | 233    | **perde 63**, fica com ~170               |

O que fica no loader do relatório: `enumerarDias`/`weekdayOf` (`:37-55`, 18),
`planoVigenteEm` (`:57-68`, 12), fallback de plano + Q3-B (`:148-191`, ~44), roster de
refeições esperadas (`:193-216`, ~24). Os dois do meio **são** o candidato 05, e mover exige
testes que não existem (ver T-B abaixo) mais uma decisão de produto sobre a fonte do fallback.

"Colapsar os 4 num só" era otimista — são 2 que morrem, 1 absorvido, 1 que fica magro. E são
5 implementations, não 4 (ver a correção em D1).

## D6 — `registro-vigente.loader.ts` + `consumo-real.loader.ts`, na raiz

**Decisão:** os dois na raiz de `apps/api/src/`, com o sufixo `.loader.ts` que o repo já usa
(`relatorio.loader.ts`). Zero diretório novo.

**Por quê:** a raiz é onde `registro-consumo.ts` já morava, e os nomes são o vocabulário que
o próprio código fala. Um diretório novo para dois arquivos que ninguém vai confundir é
cerimônia; o sufixo `.reader` seria um padrão novo num repo que já tem cinco
(`.service` `.mapper` `.module` `.controller` `.loader`).

Os termos **registro vigente**, **consumo real** e **escopo de plano** entram no `CONTEXT.md`
(criado nesta feature — não existia).

## D7 — Direto para `tasks.md`, gate único

**Decisão:** `spec.md` + `plan.md` + `research.md` derivados do grilling, sem re-perguntar
nada; um gate só, no `tasks.md`.

**Por quê:** o grilling já cobriu território de Specify (o quê/porquê, bordas, fora de
escopo) e de Plan (onde mora, contratos, testes, riscos). Rodar `/speckit-specify` e
`/speckit-plan` produziria uma spec que repete a conversa. O princípio inegociável — _nada
começa sem spec aprovada_ — é preservado: o gate existe, é um só.

---

## Os testes que faltam (e o que caiu)

Dois dos três críticos chamaram de **pré-requisito não negociável**: a suíte não sustenta a
unificação dos eixos semânticos porque é cega a eles.

- **T-A — escopo de plano.** Plano P1 `isActive:false` + P2 ativo, um `meal_event` de hoje em
  P1. Asserir que `/today` e o rebalanceamento **ignoram** e que `GET /cycles/:id` **conta**.
  Pina as duas convenções como comportamento, tornando D2 enforçável.
- **T-C — empate de `seq`.** Unit no núcleo (dois eventos, mesmo `seq`, states diferentes) +
  e2e com dois `meal_event` de `created_at` idêntico no mesmo `(dia, refeição)`, asserindo que
  estado **e** metadados vêm do mesmo evento. **Não é caracterização**: o comportamento atual
  é arbitrário (A3 da spec), então o teste só pode afirmar o novo.
- **T-D — janela do dia.** Evento de **ontem** no mesmo paciente e plano: o `/today` de hoje
  não muda. Converte em invariante testado a imunidade que hoje vem de
  `eq(loggedDate, localToday())`, **antes** de parametrizar `from/to`.

**T-B caiu.** Os críticos pediram um teste de duas vigências com `day_schedule` divergente,
para tornar o eixo D6-da-011 verificável. Ele é pré-requisito do **candidato 05**, não desta
feature: com Q3-B fora do escopo (D5), não há nada aqui que ele proteja.

## Riscos e como cada um é detectado

| Risco                                                  | Detecção                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Um call site perde o escopo de plano                   | `tsc` recusa (D2, obrigatório). Se passar por engano com o kind errado: **T-A**.                                                                  |
| Empate de ordenação volta a ser arbitrário             | **T-C**.                                                                                                                                          |
| `from/to` vaza para além do dia no caminho do paciente | **T-D**.                                                                                                                                          |
| Consumo real perde itens de `troquei`                  | `rebalance.e2e` (15 casos) + `registro.e2e` (os casos D3b), sem alteração.                                                                        |
| `plan.service` quebra ao trocar 2 leituras por 1       | `tsc` + `today-daytype.e2e` (11 casos). Falha **ruidosa**, não silenciosa.                                                                        |
| Consumo real filtra `pulei` por não ter itens          | reintroduz double-count: a pulada precisa entrar como `isRegistered: true` com 0 kcal (`rebalance.service.ts:294-305`). Pego por `rebalance.e2e`. |
| Um `Map` vazio no lugar de "não consultado"            | apaga todos os badges de `/today` (FR-013). Guarda escrita no plan.md; risco de o e2e não cobrir a combinação exata.                              |
| Alguém "consistentifica" o pareamento por `position`   | ADR-0001 diz que não; KI-002 tem o repro.                                                                                                         |
| Regressão silenciosa de número                         | SC-001: nenhuma expectativa existente pode mudar. Se precisar, é bug.                                                                             |

## Observações que não viraram escopo

- **Evento órfão de `meal` é inalcançável** (achado da verificação — a observação original
  estava errada). A FK é `ON DELETE no action`
  (`packages/db/migrations/0002_clear_cammi.sql:23`), então apagar um `meal` com eventos falha
  por violação de FK. O `INNER JOIN meal` é redundante como guarda; existe para trazer
  `position` e `name`.
- **`localToday()` mora dentro de `registro-consumo.ts:60`**, então o caminho do paciente lê o
  relógio duas vezes por request. Sai para o call site nesta feature (uma leitura).
- **`detalhe.registros` do ciclo nunca é lido pelo relatório** (verificado: 0 ocorrências em
  `apps/api/src/relatorio/`). É a leitura descartada de FR-011.
- **A janela de leitura não tem snapshot** — KI-003, pré-existente e inalterada.
