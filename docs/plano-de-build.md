# Bamboo — Plano de Build

> Companion técnico do [[decisoes-produto|Registro de Decisões de Produto]].
> Status: pré-MVP. Abordagem: **RN-first**.
> Execução passo a passo: [[plano-implementacao-fase0-fase1]].

---

## Decisão de sequência: RN-first

- Vai de **React Native (Expo)** direto, sem etapa intermediária de web responsivo.
- **Por quê:** o app do paciente *é* mobile; o nativo entrega o que a tese precisa (offline, notificação, presença na tela) e evita refazer depois.
- **Custo assumido conscientemente:** investir no nativo antes de provar a tese, e a primeira fatia funcional demora um pouco mais (build em device etc.).

### Duas jogadas pra não se pintar num canto

- **Lógica em pacote compartilhado, não na UI.** Motor de rebalanceamento, matemática de substituição/equivalência e cálculo nutricional vão pra `packages/core` (TypeScript puro, agnóstico de plataforma). Roda no servidor **e** no app (inclusive offline). A UI do RN vira um cliente fino.
- **Seed-first, UI da nutri depois.** Pra testar a alça do paciente não precisa da tela da nutri: semeia o plano direto no banco (script/seed) e você faz o papel da nutri. A UI da nutri entra numa fase posterior. O primeiro build foca 100% na tese.

---

## Estrutura do monorepo

```
bamboo/
├── apps/
│   ├── api/                 # NestJS
│   └── mobile/              # Expo (app do paciente)
│       (apps/web da nutri vem numa fase depois)
├── packages/
│   ├── db/                  # Drizzle: schema + migrations + client
│   ├── core/                # o CÉREBRO: rebalanceamento, substituição, cálculo
│   ├── types/               # contratos/DTOs compartilhados
│   └── api-client/          # client tipado da API (mobile + futura web)
├── turbo.json
└── tsconfig.base.json
```

- Boilerplate vem dos geradores oficiais: `npx create-turbo`, `nest new apps/api`, `npx create-expo-app apps/mobile`, e os `packages/*` como libs TS.
- O que **não** vem de gerador (= teu produto): o **schema** (`packages/db`) e o **core**.

---

## Roadmap por fases

### Fase 0 — Fundação (encanamento)
- Monorepo Turborepo (`api`, `mobile`; packages `db`, `core`, `types`, `api-client`)
- NestJS + Postgres + Drizzle + migrations
- Auth (nutri login; paciente entra por convite/magic link)
- Modelo de dados núcleo + ingestão da **TACO**
- *Por quê:* nada funciona sem o modelo de dados e a base nutricional.

### Fase 1 — O batimento cardíaco (prova a tese)
- Seed de um plano direto no banco (sem UI da nutri ainda)
- Paciente (RN): home **"o agora"** + **substituir um alimento dentro do grupo**, com quantidade recalculada e medida caseira
- *Por quê:* é a coisa mais diferenciada, no menor end-to-end. Se não encanta, o resto não importa.

### Fase 2 — O motor de rebalanceamento
- Motor único (recálculo por nutriente das refeições que faltam)
- Gatilhos: combinação (arroz+batata), opções desiguais, troca de tipo-de-dia
- Tipos-de-dia + programação default + override; piso; prévia antes de confirmar
- *Por quê:* transforma "consultador de cardápio" em "negociador do dia".

### Fase 3 — A inteligência da nutri (o que vende pra ela)
- Registro pendurado na consulta (feito/troquei/pulei)
- Ciclo como objeto + métrica de adesão (só nutri) + **relatório de ciclo**
- Auto-classificação dos alimentos em grupos
- UI da nutri (web) pra criar plano sozinha
- *Por quê:* o relatório é o que faz a nutri pagar — mas só depois de já ter comportamento sendo capturado.

### Fase 4 — Reduzir fricção / virar app de verdade
- Import de plano assistido por IA (PDF → estruturado)
- Offline robusto + notificações
- Registro de comida fora da lista (caso "aberto": base + casar texto + estimativa por IA)

### Fase 5+ — Negócio (o parqueado)
- Billing (assinatura), pagamentos, Pix, Stripe; deploy/infra

### Nota transversal — LGPD
Não é fase, é constante. Dado de saúde desde a Fase 0 (controle de acesso, criptografia, consentimento). Empurrar pro fim vira dívida cara.

---

## Schema inicial (Fase 0) — decisões de modelagem

> Código completo em [[schema.ts]]. As decisões que ficaram embutidas:

- **Os itens penduram em `meal_option`, não na refeição direto.** Suporta os "3 almoços" desiguais: cada opção tem seus próprios itens e balanço; escolher uma é o que dispara o rebalanceamento.
- **`is_locked` + `substitution_group_id` no `meal_item`** = a marcação de flexibilidade inteira. Travado não troca; flexível troca dentro do grupo apontado.
- **`reference_portion_grams`** (vínculo alimento↔grupo) é o que faz a conta de substituição existir: trocar = reescalar a quantidade pra manter constante o nutriente-base do grupo.
- **Plano pertence direto ao paciente** no v0; o *ciclo* vira o wrapper que versiona planos numa fase posterior.

**Adiado** (marcado no fim do schema): ciclo, seleção-de-dia, logs (feito/troquei/pulei), adesão/relatório, índices de performance.

---

## Próximo passo (escolher uma frente)

- **Motor de substituição (`packages/core`)** — função pura: recebe um item + alimento-alvo do mesmo grupo, devolve a nova quantidade (preservando o nutriente-base) + medida caseira. TS puro, testável com `vitest` sem banco. **Recomendado começar aqui** (é o coração da tese).
- **TACO + seed** — script de ingestão da tabela + seed criando nutri + paciente + plano de exemplo, pra o app ter o que consultar.
