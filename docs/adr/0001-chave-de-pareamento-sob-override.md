# A chave de pareamento sob override fica divergente por rota, deliberadamente

**Status:** ~~accepted~~ **superseded** por
[ADR-0003](./0003-option-choice-aceita-o-override-de-tipo-de-dia.md) (2026-07-26) ·
**Data:** 2026-07-25 · **Origem:** revisão de arquitetura + grilling do candidato 01
(leitura do registro)

> **Superseded em 2026-07-26.** As duas condições de reabertura que este ADR fixou foram
> cumpridas — o teste de colisão (`colisao-position.e2e-spec.ts`) e a decisão do dono (opção
> **(a)**). O ADR-0003 registra a decisão.
>
> **Este ADR fez a pergunta errada, e vale registrar por quê.** "`mealId` ou `position`?"
> pressupunha que o defeito estava na chave. Não estava: estava em **qual dia o motor recebia**.
> Com o `option-choice` aceitando o override, o roster passa a ser do tipo exibido e o `mealId`
> do evento **casa sozinho** — nenhuma troca de chave foi necessária.
>
> O que continua válido daqui: o module base de leitura preserva `mealId` e nunca agrupa por
> `position`; e a exigência de escrever o teste **antes** da decisão, que foi o que expôs o
> repro errado deste próprio documento e revelou o KI-005.

Quando o paciente registra uma refeição sob **override de tipo-de-dia**, o evento grava como
snapshot o `dayTypeId` do override (`registro.service.ts:119-137`), mas o `mealId` vem do
payload (`:370`) e é validado **só contra o plano** (`:158-174`, cadeia
`meal → day_type → plan`), nunca contra o `dayTypeId` resolvido. O evento cai no `meal` do
tipo escolhido porque o app envia esse `mealId` — não porque o service derive. Nada impede um
par `mealId`/`dayTypeId` inconsistente.

Enquanto isso o rebalanceamento resolve o tipo-de-dia sempre pelo `day_schedule` do weekday
(`rebalance.service.ts:130-147`). Isso faz o mesmo fato ter duas chaves possíveis — `mealId`
ou `position` — e hoje **as rotas escolhem diferente**: `/today` pareia por `position`
(FR-013b da 004), `rebalance.service.ts:294` pareia por `mealId`,
`GET /nutri/.../cycles/:id` preserva `mealId`, e `GET /nutri/.../cycles/:id/report` colapsa
por `position`.

**Decidimos manter as quatro convenções como estão** e tratar isso como fora do escopo da
unificação da leitura do registro (feature 012). O module base de leitura ordena por
`(logged_date, created_at, id)` e **preserva `mealId`** — nunca ordena nem agrupa por
`position`, o que colapsaria colisões em silêncio. Nenhum consumidor troca de chave.

## Por que não padronizar agora

Padronizar **não é refactor, é mudança de produto**, e nas duas direções:

- Por `position`: corrige um bug real — a refeição comida sob override não sai das alavancas
  do rebalanceamento, entra planejada no total, e a **grama exibida no app muda**. Também
  muda a contagem de `GET /cycles/:id` em dias com colisão.
- Por `mealId`: preserva o que o paciente vê hoje, mas mantém o bug vivo e muda
  `report.registro.totais`.

Qualquer das duas mexe em número que a nutri já viu ou grama que o paciente já viu. Fazer
isso na mesma leva de um refactor cujo critério de sucesso é **"nenhum número muda"**
destruiria a verificabilidade: se algo quebrasse, haveria três causas possíveis.

## Consequência não-óbvia

A suíte é **cega** a esse eixo: `relatorio.e2e-spec.ts:130-161` tem um `dayType` só e
`adesao.e2e-spec.ts:284-290` só o plano ativo. Nenhum teste monta dois tipos-de-dia com
colisão de `position`. Então "tudo verde" nunca foi — e não é — evidência de que as quatro
convenções concordam. O repro está registrado em `docs/known-issues.md` (KI-002).

Reabrir quando houver decisão de produto sobre qual dos dois lados está certo, e com o
teste de colisão escrito **antes**.
