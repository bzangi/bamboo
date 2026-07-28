# Registrar uma refeição recalcula o dia, com ou sem override de tipo-de-dia

**Status:** accepted · **Data:** 2026-07-27 · **Revoga:** Q1 / FR-013a da
[`004-motor-le-registro`](../../specs/004-motor-le-registro/spec.md)
**Decisão do dono:** 2026-07-27, ao reportar o comportamento no simulador

## Contexto

A `004` decidiu (research D5, "Q1") que o recálculo do dia pelo consumo real só valeria **enquanto
houvesse um override de tipo-de-dia ativo**; sob o tipo-de-dia programado pelo weekday, registrar
uma refeição **nunca** ajustaria as seguintes. Em código isso é um ternário:

```ts
const troca = dayTypeId ? await this.calcularTrocaTipoDia(...) : undefined;
```

O rationale registrado na época não é técnico. Está em `specs/004-motor-le-registro/research.md:67`:
o app persiste o `?dayTypeId` e o reenvia em todo reload, então _"só no toque de trocar" não se
sustenta sem um sinal novo_; **o dono escolheu** que, com override ativo, o cardápio sempre reflita
o consumido, e o tipo padrão ficasse de fora. A alternativa considerada (um sinal efêmero
`?reason=daytype-switch`) foi rejeitada por exigir mudança no app.

Ou seja: a restrição ao override nunca foi uma propriedade do domínio. Foi o escopo mínimo de
uma feature cujo gatilho declarado era a **troca de tipo-de-dia**, não o registro.

## O que forçou a revisão

O dono pulou o lanche da tarde num dia comum — sem trocar de tipo-de-dia, que é o caso da imensa
maioria dos dias — e o jantar continuou exibindo a quantidade planejada, ignorando o saldo que
sobrou. A regra do produto que ele enunciou:

> "se eu altero uma refeição ou pulo, deve ser feito o recálculo nas próximas refeições sem eu ter
> que mexer em mais nada"

Isso é o Princípio I da constituição (adaptar, não apenas mostrar) aplicado ao caminho comum. Sob a
Q1, o diferencial do produto dependia de o paciente executar um gesto não relacionado (trocar o
tipo-de-dia) para ligar.

## Decisão

**O recálculo pelo consumo real passa a ser incondicional**: sempre que existir registro no dia, as
refeições não-registradas são reajustadas, com ou sem override.

O ternário some. Nada mais muda no caminho:

- A matemática é a mesma função pura de sempre (`previewTrocaTipoDia`), com a mesma guarda de
  double-count (refeição registrada sai das alavancas e entra via consumo, pareada por `position`)
  e as mesmas alavancas (item flexível, não travado, não "à vontade"). `packages/core` fica com
  diff vazio.
- **A marcação de "registrado" continua atrás do override.** O mapper escolhe a fonte do estado
  pela presença do mapa por posição (`today.mapper.ts:213`); passar o mapa sempre mudaria o badge
  em todo dia com registro vindo de outro tipo-de-dia. Isso é o resíduo `014/A2` e **não** é
  reaberto aqui.
- O ajuste continua efêmero e derivado a cada leitura. Nada persiste.

## Consequências

**Positiva**: o comportamento que o produto vende passa a existir no dia comum, não só no dia em
que o paciente troca de tipo-de-dia.

**Negativa, aceita e documentada**: o registro de "Feito" grava o consumo dos itens **planejados**
da opção cumprida — só "Troquei" grava snapshot de quantidades. Se a tela exibir uma quantidade
ajustada e o paciente marcar "Feito", fica registrada a quantidade planejada. **Isso já era verdade
sob override**; esta decisão transforma o caso de borda em caminho padrão, e com isso a métrica de
adesão que a nutricionista lê passa a subcontar o que o paciente comeu seguindo o plano ajustado.

Não é corrigido aqui **por decisão do dono** (2026-07-27): corrigir exige decidir como se **chama**
"feito com ajuste". O vocabulário do registro é feito/troquei/pulei, e mandar as quantidades
ajustadas pelo caminho existente faria a API derivar "Troquei" — rotulando adaptação **do sistema**
como adaptação **do paciente**, o que corrompe a mesma métrica pelo outro lado. É decisão de produto
sobre o vocabulário do registro, e vira spec própria.

## Escopo desta revogação

Revoga **apenas** a condição de ativação (Q1/FR-013a). Continuam valendo, sem alteração:

- FR-013b e o pareamento por `position` sob override (`009`/FR-002, [ADR-0003](./0003-option-choice-aceita-o-override-de-tipo-de-dia.md)).
- O resíduo `014/A2`.
- A regra da `020` de nunca reescalar o que o paciente escolheu item a item.

Implementada em [`specs/022-recalculo-pelo-consumo/`](../../specs/022-recalculo-pelo-consumo/spec.md).
