// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { diff } from "./diff";

// O modal de revisão só vale se o diff for VERDADE: uma mudança que não aparece
// na lista é pior que não ter modal nenhum — a nutri confirma achando que sabe o
// que vai acontecer.

function form(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  const f = document.querySelector("form");
  if (!f) throw new Error("sem form");
  return f;
}

describe("diff", () => {
  it("não vê mudança quando nada foi tocado", () => {
    const f = form(
      `<input data-rotulo="Almoço — nome" data-orig="Almoço" value="Almoço">`,
    );
    expect(diff(f)).toEqual([]);
  });

  it("mostra o valor exibido, não o id, quando o campo é um select", () => {
    const f = form(`
      <select data-rotulo="Arroz — alimento" data-orig="Arroz branco cozido">
        <option value="f1">Arroz branco cozido</option>
        <option value="f2" selected>Batata inglesa cozida</option>
      </select>`);
    expect(diff(f)).toEqual([
      {
        rotulo: "Arroz — alimento",
        de: "Arroz branco cozido",
        para: "Batata inglesa cozida",
      },
    ]);
  });

  it("lê quantidade como UM dado: à vontade apaga as gramas", () => {
    const f = form(`
      <div>
        <input type="checkbox" checked>
        <input type="number" data-quantidade data-rotulo="Alface — quantidade" data-orig="80 g" value="80">
      </div>`);
    expect(diff(f)).toEqual([
      { rotulo: "Alface — quantidade", de: "80 g", para: "à vontade" },
    ]);
  });

  it("a marcação de remover vira uma remoção na lista", () => {
    const f = form(
      `<input type="checkbox" data-remover data-rotulo="Excluir a refeição Ceia" checked>`,
    );
    expect(diff(f)).toEqual([
      {
        rotulo: "Excluir a refeição Ceia",
        de: "Excluir a refeição Ceia",
        para: null,
      },
    ]);
  });

  it("remover NÃO marcado não é mudança", () => {
    const f = form(
      `<input type="checkbox" data-remover data-rotulo="Excluir a refeição Ceia">`,
    );
    expect(diff(f)).toEqual([]);
  });

  it("linha em branco preenchida vira adição, com a quantidade junto", () => {
    const f = form(`
      <div data-linha-nova>
        <select data-novo data-rotulo="Novo alimento em Almoço · Padrão">
          <option value="" selected></option>
          <option value="f9">Feijão carioca cozido</option>
        </select>
        <div>
          <input type="checkbox">
          <input type="number" data-quantidade value="100">
        </div>
      </div>`);
    const vazio = diff(f);
    expect(vazio).toEqual([]); // nada escolhido: nada a criar

    // Escolhe como quem clica na lista (`.selected` na opção), e não por
    // `select.value =`: a produção nunca atribui valor, quem escolhe é a nutri.
    const escolhida = f.querySelectorAll("option")[1];
    if (escolhida instanceof HTMLOptionElement) escolhida.selected = true;
    expect(diff(f)).toEqual([
      {
        rotulo: "Novo alimento em Almoço · Padrão",
        de: null,
        para: "Feijão carioca cozido — 100 g",
      },
    ]);
  });

  it("o convite do select NÃO é uma escolha", () => {
    // "Escolha o alimento…" tem texto e não é alimento nenhum: decidir por
    // texto fazia TODA opção sem alimento aparecer como item novo.
    const f = form(`
      <div data-linha-nova>
        <select data-novo data-rotulo="Novo alimento em Almoço · Padrão">
          <option value="" selected>Escolha o alimento…</option>
          <option value="f9">Feijão carioca cozido</option>
        </select>
      </div>`);
    expect(diff(f)).toEqual([]);
  });

  it("mudanças no MESMO nó viram uma linha só, na ordem dos campos", () => {
    const f = form(`
      <select data-grupo="i1" data-rotulo="Almoço · Padrão · Patinho" data-orig="Patinho bovino grelhado">
        <option value="f1">Patinho bovino grelhado</option>
        <option value="f2" selected>Peru, congelado, assado</option>
      </select>
      <div>
        <input type="checkbox">
        <input type="number" data-quantidade data-grupo="i1" data-rotulo="Almoço · Padrão · Patinho" data-orig="150 g" value="125">
      </div>`);
    expect(diff(f)).toEqual([
      {
        rotulo: "Almoço · Padrão · Patinho",
        de: "Patinho bovino grelhado · 150 g",
        para: "Peru, congelado, assado · 125 g",
      },
    ]);
  });

  it("nós diferentes seguem em linhas diferentes", () => {
    const f = form(`
      <input data-grupo="i1" data-rotulo="Item 1" data-orig="a" value="b">
      <input data-grupo="i2" data-rotulo="Item 2" data-orig="c" value="d">`);
    expect(diff(f)).toHaveLength(2);
  });

  it("no grupo de rádio, só o marcado responde pelo grupo", () => {
    const f = form(`
      <input type="radio" name="p" data-rotulo="Almoço — opção padrão" data-orig="Arroz e carne" data-valor="Arroz e carne">
      <input type="radio" name="p" data-rotulo="Almoço — opção padrão" data-orig="Arroz e carne" data-valor="Macarrão" checked>`);
    expect(diff(f)).toEqual([
      {
        rotulo: "Almoço — opção padrão",
        de: "Arroz e carne",
        para: "Macarrão",
      },
    ]);
  });
});
