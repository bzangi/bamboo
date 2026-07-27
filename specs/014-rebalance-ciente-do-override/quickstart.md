# Quickstart / smoke manual — feature 014

O que a suíte automatizada **já prova** (não precisa refazer): que a API devolve 200 sob
override, que as alavancas são do tipo exibido, que o registro sob override entra no cálculo, e
que o caminho sem override não mudou. Isso está em `apps/api/test/colisao-position.e2e-spec.ts`.

O que **só o simulador prova**: que o app realmente **propaga** o `dayTypeId`. Um erro de
propagação (prop não passada, `useEffect` sem a dep) passa em todo teste de API e quebra na tela.
É por isso que este smoke existe.

---

## Passo 0 — regra que evita perder tempo

O tipo-de-dia de hoje sai do **weekday do processo da API**, e o seed programa
**seg–sex → `treino`, sáb/dom → `descanso`**.

Não decore qual é: **descubra e troque para o OUTRO.** O roteiro abaixo funciona nos dois casos,
porque o Almoço tem mais de uma opção nos dois tipos (`treino` 3, `descanso` 2) — e é a refeição
com chips que interessa.

```bash
node -e "console.log('weekday de hoje:', new Date().getDay(), '→', [0,6].includes(new Date().getDay()) ? 'descanso' : 'treino')"
```

⚠️ Se você virar a meia-noite no meio do smoke, o tipo default troca. Recarregue o app.

---

## Passo 1 — subir o ambiente

```bash
docker compose up -d
pnpm --filter @bamboo/db db:migrate
node --env-file=.env --import tsx packages/db/scripts/seed.ts   # anote o patientId do log
```

⚠️ **O `patientId` muda a cada seed.** Não reaproveite um id de anotação antiga.

A API sobe em **3000** por default, e o app aponta para **3002**. Escolha um:

```bash
PORT=3002 pnpm --filter api start          # opção A: sobe a API onde o app já procura
# ou opção B: deixe a API em 3000 e aponte o app com EXPO_PUBLIC_API_URL=http://localhost:3000
```

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:3002
EXPO_PUBLIC_PATIENT_ID=<o uuid do seed>
```

---

## Passo 2 — pré-check de 10 segundos, sem simulador

Vale a pena: se isto falhar, o problema é de API/ambiente e não adianta abrir o simulador.

```bash
PID=<patientId do seed>
# tipo-de-dia default de hoje e o id do OUTRO tipo:
curl -s "http://localhost:3002/patients/$PID/today" | jq '{hoje: .dayType, todos: .availableDayTypes}'

OUTRO=<id do tipo que NÃO é o de hoje>
# a refeição e a opção não-default do Almoço no OUTRO tipo:
curl -s "http://localhost:3002/patients/$PID/today?dayTypeId=$OUTRO" \
  | jq '.meals[] | select(.position==2) | {mealId:.id, default:.defaultOption.id, opcoes:[.options[]|{id,label,isDefault}]}'

# O TESTE: prévia sob override. Antes da 014 isto era 404.
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://localhost:3002/patients/$PID/rebalance/option-choice" \
  -H 'content-type: application/json' \
  -d "{\"triggerMealId\":\"<mealId do Almoço do OUTRO tipo>\",\"chosenOptionId\":\"<id de uma opção NÃO-default>\",\"dayTypeId\":\"$OUTRO\"}"
```

**Esperado: `200`.** Se vier `404 "refeição do gatilho não está no dia corrente"`, a API está
sem a 014 — confira que você está na `main` atualizada.

---

## Passo 3 — o smoke de verdade (simulador)

```bash
pnpm mobile:dev
```

Marque ✅/❌ em cada item:

1. **App abre** na Home, mostrando o tipo-de-dia de hoje anunciado no topo.
2. **Trocar o tipo-de-dia** no picker para o OUTRO tipo. O cardápio muda.
3. **Tocar num chip de opção não-default do Almoço.**
   - ✅ **A prévia abre** (bottom sheet com as gramas recalculadas ou "sem ajuste").
   - ❌ **Erro / "Falha ao calcular a prévia"** → é o bug que a 014 deveria ter matado. Isto é
     exatamente o que este smoke existe para pegar: significa que o app **não** está mandando o
     `dayTypeId`, apesar de a API aceitar (o passo 2 passou).
4. **Confirmar a troca** na prévia. As gramas exibidas passam a ser as ajustadas.
5. **Ainda sob override, registrar uma refeição** (Feito ou Pulei) numa refeição **anterior** —
   ex.: o Café da manhã.
6. **Tocar de novo** num chip de opção não-default do Almoço.
   - ✅ A refeição já registrada **não** recebe ajuste (ela saiu das alavancas), e o número da
     prévia é **diferente** do que apareceu no passo 3.
   - Este é o Sintoma A do KI-002 morto na prática: antes, o registro feito sob override era
     invisível para o motor.
7. **Voltar para o tipo-de-dia de hoje** pelo picker e tocar num chip de opção.
   - ✅ A prévia abre normalmente (o caminho sem override nunca esteve quebrado).
   - ⚠️ **Resíduo esperado, NÃO é bug:** o registro que você fez no passo 5 (feito no OUTRO
     tipo) **não** influencia esta prévia, embora o badge de registrado possa aparecer na
     posição correspondente. É a consequência decidida de (a) — ver
     [ADR-0003](../../docs/adr/0003-option-choice-aceita-o-override-de-tipo-de-dia.md), seção
     "Resíduo aceito". Se te incomodar na prática, é aí que a decisão volta para você.

---

## Se algo falhar

- **Passo 2 dá 404** → a API não tem a 014, ou o `dayTypeId` que você mandou não é do plano
  ativo (a mensagem distingue: `"tipo-de-dia não encontrado no plano do paciente"` vs
  `"refeição do gatilho não está no dia corrente"`).
- **Passo 2 passa, passo 3 falha** → o app não propaga. Olhe
  `apps/mobile/src/HomeScreen.tsx` (`dayTypeId={dayTypeId}` na `RebalancePreviewSheet`) e
  `RebalancePreviewSheet.tsx` (o campo no corpo e `dayTypeId` nas deps do `useEffect`).
- **Sem chips no Almoço** → o seed não rodou, ou você está olhando outra refeição. Só o Almoço
  tem mais de uma opção.
