# Implementation Plan: Visão da nutri — a parte essencial

**Input**: [spec.md](./spec.md) · **Date**: 2026-07-26 · **Status**: implementado

## Resumo técnico

Duas telas server-rendered no `apps/web` (que hoje é boilerplate) sobre as vias `/nutri/*` que
já existem, mais **um** endpoint novo — a listagem de pacientes, a única peça de API que a tela
exige e que não existe.

**Nenhuma régua nova.** A matemática toda (adesão, agregação semanal, comparativo) é da 006/011
e não é tocada. O que a web faz é formatação: escala, sinal, largura de barra, data curta.
Portanto **`packages/core` fica intocado** — não há regra de domínio nova, e regra de
apresentação não é domínio.

## Constitution check

| Princípio                                | Como esta feature se comporta                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I — Adaptar, não só mostrar              | Neutro: é a via da nutri. O que ela mostra é o **efeito** da adaptação (troquei/pulei), que é o insumo da próxima consulta.                                                                                   |
| II — Mostra o certo por padrão           | A tela abre no ciclo relevante (aberto, senão o último) sem seletor. Nada a configurar.                                                                                                                       |
| III — Functional core / imperative shell | **Núcleo intocado.** Casca nova = 1 service Nest (I/O) + páginas server-side. Derivação de apresentação isolada em módulo puro testável (`apps/web/lib/format.ts`), fora do core porque não é domínio.        |
| IV — SDD/TDD                             | e2e do endpoint escrito antes do endpoint; unit das puras antes das páginas. Gates auto-aprovados por diretiva explícita da sessão (`/goal`: "não me pergunte nada").                                         |
| V — LGPD                                 | Minimização: a listagem devolve `id` + `name` + ciclo, nada mais (FR-004). A credencial **nunca** vai ao browser: todo fetch é server-side (FR-006). Limite v0 do papel "nutri do sistema" declarado na spec. |
| VI — YAGNI                               | 1 endpoint, 2 rotas, 0 dependências novas de runtime, 0 migration, 0 componente client.                                                                                                                       |

## Decisões

- **D1 — Um endpoint, não dois.** `GET /nutri/patients` devolve `cicloAtual` por paciente; a
  tela do paciente relê a listagem para obter nome + ciclo. Alternativa recusada:
  `GET /nutri/patients/:id`. Motivo: a regra "qual ciclo mostrar" fica em **um** lugar (a API), e
  a roster de uma nutri é pequena. Teto conhecido e comentado no código: relê a lista inteira —
  vira endpoint próprio quando a roster passar de algumas centenas.
- **D2 — `cicloAtual` = aberto, senão o fechado mais recente.** A nutri quer ler o ciclo que
  está acontecendo; se não há, o que acabou. Ordenação explícita
  (`closedOn` desc → `startedOn` desc → `id`) — determinismo, na linha do I-2 da 013.
- **D3 — Módulo Nest novo (`apps/api/src/nutri/`) em vez de método no `CicloController`.**
  A pasta já existe (só o guard). A listagem é a **roster**, não ciclo; enfiar no ciclo faria o
  módulo do ciclo crescer por chamador. Custo: 3 arquivos pequenos.
- **D4 — DTO em `packages/types`.** Mesma razão que a 011 deu para o relatório: o consumidor é a
  web. Aqui ele **é** o consumidor, então não é especulação.
- **D5 — Server Components puros, zero client JS.** É a única forma de a chave não vazar (a
  alternativa — route handler + fetch no cliente — dobra o código para o mesmo resultado). Sem
  `use client` em nenhum arquivo; sem estado; sem hidratação.
- **D6 — Reuso do `requestJson` do `@bamboo/api-client`** em vez de `fetch` cru: ele já separa
  "não conectou" de "a API respondeu erro", que é exatamente o que a US3 precisa dizer. **Não**
  adiciono funções de nutri ao pacote do paciente — o wrapper com a chave vive no `apps/web`.
- **D7 — Visualização em CSS, sem lib.** Duas formas: (a) evolução semanal = barras por semana,
  largura proporcional aos dias da fatia (semana parcial fica literalmente mais curta — o campo
  `parcial` deixa de ser só um selo); (b) padrão de registro = uma barra empilhada 100%.
  Paleta categórica validada pelo `validate_palette.js` (3 séries reais passam todos os checks
  em claro e escuro); "sem registro" é ausência de dado, então é neutro + hachurado + rótulo
  visível, nunca uma quarta cor de série.
- **D8 — Porta 3001 no `dev` do web.** A API sobe em 3000 por default; o boilerplate do web
  também pedia 3000. Colisão silenciosa é o primeiro tropeço de quem roda os dois.

## Contratos

```
GET /nutri/patients            (header x-nutri-key, fail-closed)
200 → { patients: [ { id, name, cicloAtual: CicloAtualDto | null } ] }
403 → sem/errada a credencial
```

```ts
// packages/types/src/nutri.ts
interface CicloAtualDto {
  id: string;
  startedOn: string; // YYYY-MM-DD
  closedOn: string | null; // null = aberto
  expectedDurationDays: number;
  aberto: boolean;
}
interface NutriPatientDto {
  id: string;
  name: string;
  cicloAtual: CicloAtualDto | null;
}
interface NutriPatientsResponse {
  patients: readonly NutriPatientDto[];
}
```

Consumidos sem alteração: `GET /nutri/patients/:patientId/cycles/:cycleId/report` (011).

## Onde mora o quê

| Camada      | Arquivo                                      | Papel                                                                       |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| contrato    | `packages/types/src/nutri.ts`                | DTOs da via da nutri                                                        |
| casca (API) | `apps/api/src/nutri/patients.service.ts`     | 1 query `patient ⟕ cycle`, agrupa em memória, mapeia para DTO (função pura) |
| casca (API) | `apps/api/src/nutri/patients.controller.ts`  | controller fino sob `NutriKeyGuard`                                         |
| casca (API) | `apps/api/src/nutri/nutri.module.ts`         | wiring                                                                      |
| casca (web) | `apps/web/lib/nutri.ts`                      | **server-only**: baseUrl + chave da env, os 2 GETs                          |
| puro (web)  | `apps/web/lib/format.ts`                     | escala/sinal/data/largura/escolha — testado                                 |
| UI          | `apps/web/app/page.tsx`                      | roster                                                                      |
| UI          | `apps/web/app/patients/[patientId]/page.tsx` | o ciclo do paciente                                                         |
| UI          | `apps/web/app/nutri.module.css`              | um módulo CSS para as duas telas                                            |

## Modelo de dados

Sem migration. Leitura de `patient` (`id`, `name`) e `cycle` (`id`, `patient_id`, `started_on`,
`closed_on`, `expected_duration_days`). Uma query com `leftJoin` — a roster é pequena e
ordenada no banco; o agrupamento por paciente é em memória (sem N+1).

## Estratégia de teste

1. **e2e novo** `apps/api/test/nutri-patients.e2e-spec.ts`, self-contained sobre `buildScenario`
   (013): dois cenários — um paciente com ciclo aberto, um sem ciclo nenhum, um com dois ciclos
   fechados. Asserções **por paciente do cenário** (a listagem é global: nunca asserir o
   tamanho da lista nem a posição absoluta — seria frágil por construção).
2. **unit novo** `apps/web/lib/format.test.ts` (Vitest, `environment: node`, padrão do mobile):
   escalas 0–100 e 0–1, delta `null`/negativo, semana parcial, semana sem dado, `findPatient`.
3. **Sem teste de componente**: não há harness de componente no repo (mesma decisão consciente
   do mobile). O que as páginas fazem além de layout está nas puras testadas.
4. **Verificação manual** (quickstart): docker + seed + API + `pnpm --filter web dev`, as duas
   telas abertas, e `curl` no HTML servido para provar que a chave não aparece (SC-005).

## Riscos

| Risco                                                                       | Mitigação                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 014 (`rebalance ciente do override`) está em curso na árvore, não commitado | Nenhum arquivo em comum. Commits sempre com caminhos explícitos, nunca `git add -A`.                                      |
| `params` é `Promise` no Next 16 (mudou no 15)                               | `await params` na página dinâmica; `check-types` pega se errar.                                                           |
| Pacotes do workspace expostos em TS puro                                    | `transpilePackages` já lista `@bamboo/types`/`@bamboo/api-client`; falta só declará-los como dependência.                 |
| Escalas mistas no DTO (`media` 0–100, `cobertura` e `taxa*` 0–1)            | Não formatar à mão em JSX: duas funções puras distintas (`pct100`, `pct01`), testadas. É o erro mais provável desta tela. |
