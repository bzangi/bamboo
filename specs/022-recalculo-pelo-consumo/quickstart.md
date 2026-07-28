# Quickstart — verificação manual da 022

Pré-requisitos: banco de dev no ar, `packages/db/scripts/seed.ts` rodado, API em `pnpm --filter api dev` (porta **3333**) e o app no simulador. Quem sobe os servidores é o Bruno.

## Parte 1 — o dia se reequilibra sozinho (US1)

1. Abrir a tela inicial **sem trocar o tipo-de-dia**. Anotar a quantidade de um item flexível de uma refeição futura (ex.: o arroz do jantar).
2. Numa refeição anterior, tocar **"Pulei"**.
3. Voltar à tela inicial. **Esperado**: a quantidade anotada aumentou, a refeição aparece marcada como ajustada e a frase de porquê está visível.
4. Puxar para recarregar. **Esperado**: os mesmos valores (o ajuste é derivado do registro, não do gesto).
5. **Desfazer** o registro do passo 2. **Esperado**: as quantidades voltam ao planejado e a marcação de ajustado some.
6. Repetir o passo 2 com **"Feito"** numa refeição sem adaptação. **Esperado**: nada muda nas seguintes.

## Parte 2 — trocar a opção da última refeição (US2)

1. Registrar **todas** as refeições do dia menos a última. Incluir ao menos um "Pulei", para haver saldo.
2. Na última refeição, tocar um chip de outra opção.
3. **Esperado**: abre a prévia com as quantidades **dessa mesma refeição** recalculadas, e o texto diz que o ajuste é nela — não "no resto do dia". Botões: Cancelar e Confirmar.
4. Confirmar. **Esperado**: a opção troca na tela e as quantidades exibidas são as da prévia.
5. Numa refeição cujos itens sejam todos travados ou "à vontade", repetir o passo 2. **Esperado**: a orientação de seguir o plano aparece **e** o botão de confirmar mesmo assim continua disponível ("nunca barra").

## O que NÃO deve acontecer

- Quantidade de refeição **já registrada** mudar.
- Item "à vontade" (alface, brócolis) ganhar gramas.
- Item travado mudar de quantidade.
- A marcação de "registrado" (o badge por refeição) mudar de lugar ou sumir em relação a antes da feature.
- Qualquer coisa ser gravada: `select count(*) from meal_event` e `meal_event_item` antes e depois de carregar a tela e abrir a prévia devem ser iguais.

## Resíduo conhecido (não é bug desta feature)

Se a tela exibir uma quantidade **ajustada** e você tocar "Feito", o que fica gravado é a quantidade **planejada** — está documentado na spec como resíduo aceito, com spec própria pendente. Não reportar como regressão.
