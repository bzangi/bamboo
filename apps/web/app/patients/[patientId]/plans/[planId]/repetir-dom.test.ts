// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { adicionarLinha, removerLinha } from "./repetir-dom";

// O que estes testes protegem: duas linhas com o MESMO índice se sobrescrevem no
// FormData e uma some no salvar, sem erro nenhum. É o modo de falha silencioso
// desta tela.

const LINHA = `
  <div data-linha-nova data-slot="novo-item.op1">
    <label for="novo-item.op1.0.foodId">Alimento</label>
    <select id="novo-item.op1.0.foodId" name="novo-item.op1.0.foodId">
      <option value="" selected>Escolha o alimento…</option>
      <option value="f1">Arroz</option>
    </select>
    <input type="checkbox" name="novo-item.op1.0.aVontade" value="1">
    <input type="number" name="novo-item.op1.0.quantityGrams">
    <button type="button" data-mais>+</button>
    <button type="button" data-menos>x</button>
  </div>`;

/** Uma linha de OPÇÃO com uma linha de alimento dentro — o caso que a regra do
 *  "último número do nome" quebrava. */
const OPCAO = `
  <div data-linha-nova data-slot="nova-op.m1">
    <input name="nova-op.m1.0.label">
    <div id="itens-0">
      <div data-linha-nova data-slot="nova-op.m1.0.item">
        <select name="nova-op.m1.0.item.0.foodId"><option value=""></option></select>
        <button type="button" data-mais>+</button>
      </div>
    </div>
    <button type="button" data-mais>+</button>
  </div>`;

let raiz: HTMLElement;

const nomes = () =>
  Array.from(raiz.querySelectorAll<HTMLElement>("[name]")).map(
    (e) => (e as HTMLInputElement).name,
  );

const linhas = () => raiz.querySelectorAll("[data-linha-nova]").length;

beforeEach(() => {
  document.body.innerHTML = `<div id="raiz">${LINHA}</div>`;
  const r = document.getElementById("raiz");
  if (!r) throw new Error("sem raiz");
  raiz = r;
});

describe("adicionarLinha", () => {
  it("põe a cópia embaixo, com o índice seguinte em name, id e for", () => {
    adicionarLinha(raiz);
    expect(linhas()).toBe(2);
    expect(nomes()).toEqual([
      "novo-item.op1.0.foodId",
      "novo-item.op1.0.aVontade",
      "novo-item.op1.0.quantityGrams",
      "novo-item.op1.1.foodId",
      "novo-item.op1.1.aVontade",
      "novo-item.op1.1.quantityGrams",
    ]);
    expect(raiz.querySelectorAll('[id="novo-item.op1.1.foodId"]')).toHaveLength(
      1,
    );
    expect(raiz.querySelectorAll<HTMLLabelElement>("label")[1]?.htmlFor).toBe(
      "novo-item.op1.1.foodId",
    );
  });

  it("a cópia nasce vazia e não leva o que foi digitado na de cima", () => {
    const select = raiz.querySelector<HTMLSelectElement>("select");
    const gramas = raiz.querySelector<HTMLInputElement>('input[type="number"]');
    const aVontade = raiz.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (!select || !gramas || !aVontade) throw new Error("sem campos");
    const arroz = raiz.querySelectorAll("option")[1];
    if (arroz instanceof HTMLOptionElement) arroz.selected = true;
    gramas.value = "120";
    aVontade.checked = true;

    adicionarLinha(raiz);

    const nova = raiz.querySelectorAll("[data-linha-nova]")[1];
    expect(nova?.querySelector<HTMLSelectElement>("select")?.value).toBe("");
    expect(
      nova?.querySelector<HTMLInputElement>('input[type="number"]')?.value,
    ).toBe("");
    expect(
      nova?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    // E a de cima segue intacta: renumerar não pode apagar o que foi digitado.
    expect(gramas.value).toBe("120");
  });
});

describe("linha aninhada", () => {
  it("clonar a OPÇÃO renumera a opção e arrasta os alimentos dela — sem mexer no índice deles", () => {
    document.body.innerHTML = `<div id="raiz">${OPCAO}</div>`;
    const r = document.getElementById("raiz");
    if (!r) throw new Error("sem raiz");

    adicionarLinha(r);

    const nomes = Array.from(r.querySelectorAll<HTMLElement>("[name]")).map(
      (e) => (e as HTMLInputElement).name,
    );
    expect(nomes).toEqual([
      "nova-op.m1.0.label",
      "nova-op.m1.0.item.0.foodId",
      "nova-op.m1.1.label",
      // O alimento da opção 1 continua sendo o alimento 0 DELA: uma regra que
      // trocasse "o último número" teria escrito `...0.item.1.foodId` e posto
      // dois alimentos na primeira opção.
      "nova-op.m1.1.item.0.foodId",
    ]);
    // E o slot interno acompanhou, senão o próximo "+" de dentro escreveria
    // por cima da opção de cima.
    expect(
      Array.from(r.querySelectorAll<HTMLElement>("[data-slot]")).map(
        (e) => e.dataset.slot,
      ),
    ).toEqual([
      "nova-op.m1",
      "nova-op.m1.0.item",
      "nova-op.m1",
      "nova-op.m1.1.item",
    ]);
  });
});

describe("removerLinha", () => {
  it("tira a linha e RENUMERA as que sobraram", () => {
    adicionarLinha(raiz);
    adicionarLinha(raiz);
    expect(linhas()).toBe(3);

    const doMeio = raiz.querySelectorAll("[data-linha-nova]")[1];
    const botao = doMeio?.querySelector("[data-menos]");
    if (!botao) throw new Error("sem botão");
    removerLinha(raiz, botao);

    expect(linhas()).toBe(2);
    // Sem renumerar, sobrariam os índices 0 e 2 — e o próximo "+" faria uma
    // segunda linha 2, que sobrescreveria esta no FormData.
    expect(nomes().filter((n) => n.endsWith(".foodId"))).toEqual([
      "novo-item.op1.0.foodId",
      "novo-item.op1.1.foodId",
    ]);
  });

  it("a última linha não some — é esvaziada", () => {
    const gramas = raiz.querySelector<HTMLInputElement>('input[type="number"]');
    if (!gramas) throw new Error("sem campo");
    gramas.value = "300";

    const botao = raiz.querySelector("[data-menos]");
    if (!botao) throw new Error("sem botão");
    removerLinha(raiz, botao);

    expect(linhas()).toBe(1);
    expect(gramas.value).toBe("");
  });

  it("ignora um alvo que não está dentro deste bloco", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="outro">${LINHA}</div>`,
    );
    const forasteiro = document.querySelector("#outro [data-menos]");
    if (!forasteiro) throw new Error("sem botão");
    removerLinha(raiz, forasteiro);
    expect(linhas()).toBe(1);
    expect(document.querySelectorAll("#outro [data-linha-nova]")).toHaveLength(
      1,
    );
  });
});
