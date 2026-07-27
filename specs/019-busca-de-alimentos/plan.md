# Implementation Plan: Busca de alimentos (fuzzy) + paginação do catálogo

**Input**: [spec.md](./spec.md)

## Onde mora

| Peça                                          | Camada                                                  |
| --------------------------------------------- | ------------------------------------------------------- |
| A régua de busca (normalizar/pontuar/ordenar) | núcleo puro — `packages/core/src/fuzzy.ts`              |
| Pré-filtro em SQL + fatia da página           | casca — `apps/api/src/plano-editor/catalogo.service.ts` |
| Campo de busca do sheet                       | app — `apps/mobile/src/SubstitutionSheet.tsx`           |

`@bamboo/core` passa a ser dependência do `apps/mobile` — é exatamente o que a constituição prevê
("roda no servidor **e** no app"). Sem isso a alternativa seria duplicar o scorer, e duas cópias de
uma régua de ordenação divergem no primeiro ajuste.

## Decisões

**D1 — Fuzzy = subsequência pontuada, não distância de edição.** É a semântica de fzf/VSCode: os
caracteres do termo aparecem no nome, na ordem, não necessariamente juntos. Casamento **guloso pela
esquerda**, que para _existência_ de subsequência é ótimo (só a pontuação é que fica subótima).
Pontuação: +1 por caractere, +4 se contíguo ao anterior, +3 se em início de palavra, −1 por
caractere pulado (teto 3). Escala sem significado fora da comparação.

**D2 — O pré-filtro continua no Postgres.** `LIKE '%a%r%r%o%z%'` **é** o teste de subsequência, e a
dobra de acento já existia (`translate(lower(...))`). Então o SQL filtra e o núcleo só **ordena** —
as duas metades nunca discordam porque usam a mesma normalização. Some a query de `count(*)`:
`total` passa a ser o tamanho do conjunto casado (2 queries → 1).

**D3 — Paginação por `offset`, fatiada em memória.** A ordenação é por relevância, que o Postgres não
conhece; `OFFSET` no SQL ordenaria pela coisa errada. Com ~600 alimentos, materializar os que casaram
e fatiar é o custo de nada — e é o mesmo teto que o `ponytail:` do arquivo já declarava.

**D4 — Desempate por ordem de entrada.** `buscarFuzzy` é **estável**: empate de pontos preserva a
ordem recebida. A casca entrega já ordenado por `(name, id)` — o `, id` é a lição da 012/I-2. Nenhum
`localeCompare` escondido no núcleo.

**D5 — A busca do paciente não fala com a rede.** O `/meal-items/:id/substitutions` já devolve **todas**
as alternativas elegíveis do grupo; filtrar o que já está em mão é uma expressão, e um endpoint de
busca por tecla seria pior em toda métrica. O campo só aparece a partir de 8 alternativas — abaixo
disso ele é ruído numa tela pequena.

**D6 — A resposta de `/nutri/foods` não ganha campo.** Cliente sabe o `limit`/`offset` que mandou;
`hasMore` = `offset + foods.length < total`. Ecoar parâmetro é campo para manter sem ninguém ler.

**D7 — As alternativas passam a sair ordenadas por nome.** Hoje a query do `substitution.service`
não tem `ORDER BY`: a ordem é o que o heap devolver. Com desempate estável isso viraria "relevância
e depois arbitrário". Uma linha.

## Riscos

- **Subsequência é mais frouxa que substring**: termos curtos casam muito. Mitigado pela ordenação
  (substring contígua no início de palavra pontua muito acima) — não por limiar, que precisaria de
  calibração que ninguém tem dado para fazer.
- **`@bamboo/core` no bundle do Metro**: mesmo formato do `@bamboo/api-client`, que já funciona
  (ESM em `dist/`, zero dependência externa). Exige `pnpm build` antes do `tsc` do mobile — já era
  verdade.

## Testes

- `packages/core/src/fuzzy.test.ts` — acento, caixa, subsequência, não-casamento, ranking
  (contiguidade e início de palavra), estabilidade do empate, termo vazio.
- `apps/api/test/catalogo.e2e-spec.ts` — páginas disjuntas, `offset` além do total, `total` estável,
  achar por subsequência; os casos de `%`/`_` literais **não mudam**.
- Sheet do paciente: sem harness de componente RN no repo (decisão da 005) — a lógica testada é a do
  núcleo; o componente só chama `buscarFuzzy`.
