# A prévia de rebalanceamento aceita o override de tipo-de-dia, e o motor segue o tipo exibido

**Status:** accepted · **Data:** 2026-07-26 · **Supersede:**
[ADR-0001](./0001-chave-de-pareamento-sob-override.md)
**Decisão do dono:** opção **(a)**, 2026-07-26

## Contexto

O ADR-0001 decidiu **manter divergentes** as quatro convenções de pareamento sob override, e
condicionou a reabertura a duas coisas: _"decisão de produto sobre qual dos dois lados está
certo, **e com o teste de colisão escrito antes**"_.

Ambas foram satisfeitas:

- **O teste** (2026-07-26): `apps/api/test/colisao-position.e2e-spec.ts`, o único lugar da suíte
  que monta dois tipos-de-dia com `position` colidindo. Poder de detecção verificado por
  reversão, não presumido.
- **A decisão** (2026-07-26): opção **(a)**.

A investigação que precedeu a decisão corrigiu três coisas que o próprio repo afirmava errado:

1. **O repro publicado no KI-002 não demonstrava o bug.** Ele mandava registrar também na
   posição do tipo exibido, que casa por `mealId`, sai das alavancas e **mascara** o efeito. Quem
   seguisse o roteiro concluiria que não havia bug.
2. **A atribuição a FR-013b da 004 era enganosa.** `grep -c position` na spec da 004 = **0**.
   `position` é decisão de *plano* (research D5), presa a um parâmetro de uma função no
   `getToday`, e marcada lá como **aproximação v0**. O endosso em nível de spec é da **009**
   (FR-002) — cuja FR-011 proíbe alterar a matemática do motor. Não havia regra decidida que
   alcançasse `POST option-choice`.
3. **Havia um bug maior e não catalogado** (KI-005): sob override, a prévia devolvia **404 para
   qualquer refeição**, com ou sem registro — porque o app manda o `triggerMealId` do cardápio
   exibido e o roster vinha do weekday. O diferencial do produto estava **inalcançável**.

## Decisão

**`POST /patients/:id/rebalance/option-choice` aceita um `dayTypeId` opcional no corpo**, com a
mesma semântica que `POST /registro` já tinha. Quando presente, o dia que o motor considera —
roster, alavancas e **faixa-alvo** — é o do tipo-de-dia pedido.

Corolários que isto **decide**, e que nenhum artefato respondia antes:

- **Sob override, o dia é avaliado contra a faixa-alvo do tipo EXIBIDO.** O paciente vê B,
  escolhe em B, é medido contra B. Decidido por construção: o roster é do tipo resolvido, logo o
  alvo também.
- **A chave de pareamento continua `mealId`.** Não porque `mealId` seja "a chave certa" em
  abstrato, mas porque com o roster correto ela **casa sozinha**. A pergunta do ADR-0001
  ("`mealId` ou `position`?") era a pergunta errada: o defeito não estava na chave, estava em
  **qual dia o motor recebia**.

## Por que (b) foi rejeitada

A opção (b) era manter a resolução por weekday e parear o consumo por `position`.

- **Não mata o KI-005.** Verificado por reversão: aplicando (b) ao `rebalance.service`, os casos
  do KI-005 seguem verdes — o 404 continua. Consertaria o número e deixaria a função sem rodar.
- **Obrigaria a inventar desempate.** Duas refeições de tipos diferentes na mesma `position` no
  mesmo dia é alcançável. O relatório resolve com último-ganha arbitrário; o motor não tem regra
  nenhuma. (b) exigiria criar uma.
- **Mudaria grama que o paciente já viu** num caminho que (a) não toca.

(a) é menor, mata os dois defeitos, e não introduz regra nova: reusa a resolução que `/today` e
`/registro` já fazem. A assimetria entre os três caminhos **era** a causa raiz.

## Resíduo aceito — e é o preço de (a)

**(a) faz o motor seguir o tipo EXIBIDO.** No caminho "registrei sob B → voltei para A pelo
picker → escolho opção em A", o evento de B **continua invisível** ao motor, enquanto
`/today?dayTypeId=A` mostra o badge na posição correspondente (009/FR-002, pareamento por
posição).

A divergência **badge-vs-motor sobrevive nesse caminho**. É coerente com FR-013a da 004 ("o tipo
padrão nunca auto-ajusta") e com o `/today` sem override, que também ignora evento de outro tipo
— mas é **resíduo, não solução**. Fica pinado em `colisao-position.e2e-spec.ts` (bloco
`014/A2`), com o porquê escrito no teste, e registrado em KI-002.

Fechar esse resíduo exigiria decidir se o `/today` do tipo **padrão** deveria contar evento de
outro tipo — o que **contradiz FR-013a da 004**. É decisão de produto separada, e não havia
motivo para acoplá-la a esta.

## O que continua valendo do ADR-0001

O module base de leitura (`registro-vigente.loader.ts`) **preserva `mealId`** e nunca ordena nem
agrupa por `position` — o que colapsaria colisões em silêncio. Isso segue verdadeiro e segue
sendo a decisão certa.

## O que fica aberto

- **KI-002 Sintoma B** — o descarte silencioso do relatório sob colisão de `position`
  (último-ganha; o estado perdido não vira nem `semRegistro`). Rota da nutri, caminho diferente.
  Ver [ADR-0002](./0002-granularidade-divergente-nas-rotas-da-nutri.md), que separa a
  granularidade (deliberada) do descarte (defeito).
- **O resíduo acima**, se algum dia incomodar na prática.

## Lição de processo

O ADR-0001 exigir o teste **antes** da decisão foi o que salvou esta feature. Sem ele:

- o repro errado teria sido seguido, e a conclusão seria "não há bug";
- o KI-005 não teria sido descoberto, porque nada exercitava override + `option-choice` juntos;
- a rejeição de (b) seria opinião, não medição.

Vale repetir a exigência nas próximas decisões desta classe.
