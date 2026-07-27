// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { PlanoItemDto, PlanoTipoDiaDto } from "@bamboo/types";
import {
  macrosDeAtributo,
  macrosParaAtributo,
  resumoDoFormulario,
  resumoDoTipoDia,
  somar,
} from "./resumo";

// O sumário só serve se for VERDADE: um número que não acompanha o que está na
// tela é pior que não ter número — a nutri fecha o plano confiando nele.

const ARROZ = {
  kcalPer100g: 128,
  carbPer100g: 28,
  proteinPer100g: 2.5,
  fatPer100g: 0.2,
  fiberPer100g: 1.6,
  sodiumMgPer100g: 1,
};
const FRANGO = {
  kcalPer100g: 159,
  carbPer100g: 0,
  proteinPer100g: 32,
  fatPer100g: 2.5,
  fiberPer100g: 0,
  sodiumMgPer100g: 50,
};
/** Cadastrado à mão: a base não tem fibra nem sódio dele. */
const CASEIRO = {
  kcalPer100g: 200,
  carbPer100g: 10,
  proteinPer100g: 10,
  fatPer100g: 14,
  fiberPer100g: null,
  sodiumMgPer100g: null,
};

describe("somar", () => {
  it("é regra de três sobre as gramas", () => {
    expect(somar([{ macros: ARROZ, gramas: 200 }])).toMatchObject({
      kcal: 256,
      carb: 56,
      protein: 5,
      fiber: 3.2,
      sodium: 2,
      itens: 1,
    });
  });

  it("item de 0 g não entra — nem na soma nem na contagem de sem-dado", () => {
    // À vontade (018) é gravado com 0 g: contribui zero, e alegar que "falta o
    // dado de fibra" de um item que contribuiria zero é ruído.
    const r = somar([
      { macros: CASEIRO, gramas: 0 },
      { macros: ARROZ, gramas: 100 },
    ]);
    expect(r.itens).toBe(1);
    expect(r.semFibra).toBe(0);
    expect(r.kcal).toBe(128);
  });

  it("soma o que conhece e conta quantos itens não têm o dado", () => {
    const r = somar([
      { macros: ARROZ, gramas: 100 },
      { macros: CASEIRO, gramas: 100 },
    ]);
    expect(r.fiber).toBe(1.6);
    expect(r.semFibra).toBe(1);
    expect(r.semSodio).toBe(1);
    expect(r.kcal).toBe(328);
  });

  it("lista vazia é zero, não NaN", () => {
    expect(somar([])).toMatchObject({ kcal: 0, itens: 0 });
  });
});

/* ═══════════ o atributo que atravessa servidor → navegador ═══════════ */

describe("data-macros", () => {
  it("vai e volta sem perder nada, inclusive os nulos", () => {
    expect(macrosDeAtributo(macrosParaAtributo(ARROZ))).toEqual(ARROZ);
    expect(macrosDeAtributo(macrosParaAtributo(CASEIRO))).toEqual(CASEIRO);
  });

  it("fora de forma é null, e null tira o item da conta", () => {
    // Zeros no lugar de recusa baixariam o total calado — o pior dos dois erros.
    expect(macrosDeAtributo(null)).toBeNull();
    expect(macrosDeAtributo("")).toBeNull();
    expect(macrosDeAtributo("128|28|2.5")).toBeNull();
    expect(macrosDeAtributo("|28|2.5|0.2||")).toBeNull();
  });
});

/* ═══════════ do DTO ═══════════ */

let n = 0;
const item = (
  macros: PlanoItemDto["macros"],
  quantityGrams: number,
): PlanoItemDto => ({
  id: `i${++n}`,
  foodId: `f${n}`,
  foodName: "x",
  quantityGrams,
  adLibitum: quantityGrams === 0,
  isLocked: false,
  substitutionGroupId: null,
  substitutionGroupName: null,
  macros,
});

const TIPO: PlanoTipoDiaDto = {
  id: "dt1",
  name: "Treino",
  meals: [
    {
      id: "m1",
      name: "Café",
      position: 1,
      horario: null,
      options: [
        { id: "o1", label: "A", isDefault: true, items: [item(ARROZ, 200)] },
        // Alternativa para o MESMO lugar: somá-la contaria o café duas vezes.
        { id: "o2", label: "B", isDefault: false, items: [item(FRANGO, 300)] },
      ],
    },
    {
      id: "m2",
      name: "Almoço",
      position: 2,
      horario: null,
      options: [
        { id: "o3", label: "C", isDefault: true, items: [item(FRANGO, 100)] },
      ],
    },
  ],
};

describe("resumoDoTipoDia", () => {
  it("soma só a opção padrão de cada refeição", () => {
    expect(resumoDoTipoDia(TIPO)).toMatchObject({
      kcal: 256 + 159,
      protein: 5 + 32,
      itens: 2,
    });
  });

  it("refeição sem opção padrão não contribui, e sem tipo-de-dia é zero", () => {
    expect(
      resumoDoTipoDia({
        ...TIPO,
        meals: [{ ...TIPO.meals[0]!, options: [TIPO.meals[0]!.options[1]!] }],
      }),
    ).toMatchObject({ kcal: 0, itens: 0 });
    expect(resumoDoTipoDia(undefined).kcal).toBe(0);
  });
});

/* ═══════════ do DOM ═══════════ */

function dom(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  const f = document.querySelector("form");
  if (!f) throw new Error("sem form");
  return f;
}

/** Uma linha de item como a página a renderiza (macros no hidden do seletor). */
const linha = (
  id: string,
  macros: PlanoItemDto["macros"],
  g: number | "",
  extra = "",
) => `
  <li data-item>
    <input type="hidden" data-macros="${macrosParaAtributo(macros)}">
    <div>
      <input type="checkbox" ${extra.includes("vontade") ? "checked" : ""}>
      <input type="number" data-quantidade value="${g}">
    </div>
    <label><input type="checkbox" data-remover value="item:${id}" ${
      extra.includes("marcado") ? "checked" : ""
    }></label>
  </li>`;

const opcao = (id: string, padrao: boolean, itens: string, extra = "") => `
  <div data-opcao>
    <input type="radio" data-padrao name="padrao.m1" value="${id}" ${
      padrao ? "checked" : ""
    }>
    <label><input type="checkbox" data-remover value="opcao:${id}" ${
      extra.includes("marcado") ? "checked" : ""
    }></label>
    <ul>${itens}</ul>
  </div>`;

const refeicao = (id: string, opcoes: string, extra = "") => `
  <div data-refeicao>
    <label><input type="checkbox" data-remover value="refeicao:${id}" ${
      extra.includes("marcado") ? "checked" : ""
    }></label>
    ${opcoes}
  </div>`;

describe("resumoDoFormulario", () => {
  it("lê o mesmo total que o DTO quando nada foi tocado", () => {
    // A prova de que as duas entradas não divergiram: mesmo plano, mesma conta.
    const f = dom(
      refeicao(
        "m1",
        opcao("o1", true, linha("i1", ARROZ, 200)) +
          opcao("o2", false, linha("i2", FRANGO, 300)),
      ) + refeicao("m2", opcao("o3", true, linha("i3", FRANGO, 100))),
    );
    expect(resumoDoFormulario(f)).toEqual(resumoDoTipoDia(TIPO));
  });

  it("acompanha a grama digitada", () => {
    const f = dom(refeicao("m1", opcao("o1", true, linha("i1", ARROZ, 200))));
    const campo = f.querySelector<HTMLInputElement>("[data-quantidade]")!;
    campo.value = "300";
    expect(resumoDoFormulario(f).kcal).toBe(384);
  });

  it("trocar a opção padrão troca o dia", () => {
    const f = dom(
      refeicao(
        "m1",
        opcao("o1", true, linha("i1", ARROZ, 200)) +
          opcao("o2", false, linha("i2", FRANGO, 100)),
      ),
    );
    const radios = f.querySelectorAll<HTMLInputElement>("[data-padrao]");
    radios[0]!.checked = false;
    radios[1]!.checked = true;
    expect(resumoDoFormulario(f).kcal).toBe(159);
  });

  it("o que está marcado para excluir já sai da conta", () => {
    const marcado = dom(
      refeicao("m1", opcao("o1", true, linha("i1", ARROZ, 200, "marcado"))) +
        refeicao("m2", opcao("o2", true, linha("i2", FRANGO, 100))),
    );
    expect(resumoDoFormulario(marcado).kcal).toBe(159);

    const semRefeicao = dom(
      refeicao("m1", opcao("o1", true, linha("i1", ARROZ, 200)), "marcado") +
        refeicao("m2", opcao("o2", true, linha("i2", FRANGO, 100))),
    );
    expect(resumoDoFormulario(semRefeicao).kcal).toBe(159);

    const semOpcao = dom(
      refeicao("m1", opcao("o1", true, linha("i1", ARROZ, 200), "marcado")),
    );
    expect(resumoDoFormulario(semOpcao).itens).toBe(0);
  });

  it("marcar UM item não apaga a opção inteira da conta", () => {
    // O checkbox do item vive DENTRO da opção: sem o prefixo do `value`, marcar
    // um item derrubaria os irmãos junto.
    const f = dom(
      refeicao(
        "m1",
        opcao(
          "o1",
          true,
          linha("i1", ARROZ, 200, "marcado") + linha("i2", FRANGO, 100),
        ),
      ),
    );
    expect(resumoDoFormulario(f).kcal).toBe(159);
  });

  it("à vontade e campo em branco valem zero", () => {
    const f = dom(
      refeicao(
        "m1",
        opcao(
          "o1",
          true,
          linha("i1", ARROZ, 200, "vontade") + linha("i2", FRANGO, ""),
        ),
      ),
    );
    expect(resumoDoFormulario(f)).toMatchObject({ kcal: 0, itens: 0 });
  });

  it("item novo pendente entra assim que tem alimento e gramas", () => {
    const f = dom(
      refeicao("m1", opcao("o1", true, linha("i1", ARROZ, 200))) +
        // Linha nova dentro da opção padrão: hidden do seletor ainda sem escolha.
        `<div data-refeicao>${opcao(
          "o9",
          true,
          `<div data-item>
             <input type="hidden" data-macros="">
             <div><input type="checkbox"><input type="number" data-quantidade value="150"></div>
           </div>`,
        )}</div>`,
    );
    expect(resumoDoFormulario(f).itens).toBe(1);

    const hidden = f.querySelectorAll<HTMLInputElement>("[data-macros]")[1]!;
    hidden.setAttribute("data-macros", macrosParaAtributo(FRANGO));
    expect(resumoDoFormulario(f)).toMatchObject({
      itens: 2,
      kcal: 256 + 238.5,
    });
  });

  it("opção nova (sem rádio) não entra: ela nasce não-padrão", () => {
    const f = dom(
      refeicao("m1", opcao("o1", true, linha("i1", ARROZ, 200))) +
        `<div><ul>${linha("i9", FRANGO, 500)}</ul></div>`,
    );
    expect(resumoDoFormulario(f).itens).toBe(1);
  });
});
