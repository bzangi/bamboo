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

**D5 — A busca do paciente é do servidor** (revisto: a 1ª versão filtrava em memória, o que valia
enquanto a resposta trazia o grupo inteiro). Com página, filtrar só o que já baixou dá **resultado
errado** — o alimento pode estar na página que não veio. Custo: 250 ms de debounce entre a tecla e a
consulta. O campo aparece a partir de 8 alternativas, ou sempre que houver termo digitado (senão o
paciente não conseguiria apagar a busca que esvaziou a lista).

**D8 — Página nas substituições: parâmetros opcionais, resposta intacta.** `q`/`limit`/`offset` em
`GET /meal-items/:id/substitutions`; **sem os três, a saída é byte-a-byte a de hoje**, então nenhum
teste nem cliente existente muda. Sem campo `total`: o fim é "página menor que o `limit`" — uma
requisição extra no caso raro (múltiplo exato) é mais barata que um campo em toda resposta.

**D9 — Calcular tudo e fatiar depois.** `substituir` **exclui** o alvo de nutriente-base zero, então
fatiar antes do cálculo faria uma página voltar curta e o app pararia de rolar no meio do grupo. O
custo é a matemática de ~70 alvos (nada); o que a página economiza é rede, render e leitura.

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
