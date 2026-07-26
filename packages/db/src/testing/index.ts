// @bamboo/db/testing — construtor de cenário para as suítes e2e e para o seed.
// Subpath deliberadamente FORA do barril `src/index.ts`: é infraestrutura de
// teste e não pode virar dependência alcançável do runtime da API.
export * from "./scenario.js";
