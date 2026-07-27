import { describe, expect, it } from "vitest";
import {
  assinaturaItem,
  assinaturaRefeicao,
  assinaturaSemana,
  idsDe,
} from "./lote";

// O que estes testes protegem: o lote só escreve o que mudou. Uma assinatura que
// diverge entre a tela e a ação vira ou ~30 PATCHes por salvar, ou uma alteração
// engolida em silêncio — as duas invisíveis até alguém conferir no banco.

describe("idsDe", () => {
  const chaves = [
    "patientId",
    "item.aaa.foodId",
    "item.aaa.quantityGrams",
    "orig.item.aaa",
    "novo-item.op1.foodId",
    "item.bbb.foodId",
  ];

  it("colhe os ids do par prefixo/sufixo", () => {
    expect(idsDe(chaves, "item.", ".foodId")).toEqual(["aaa", "bbb"]);
  });

  it("não confunde o `orig.` com o campo que ele espelha", () => {
    // `orig.item.aaa` termina em `.aaa`, não em `.foodId` — mas mesmo o prefixo
    // é o guarda: ele casa no COMEÇO da chave.
    expect(idsDe(chaves, "item.", "")).toEqual([
      "aaa.foodId",
      "aaa.quantityGrams",
      "bbb.foodId",
    ]);
  });

  it("não confunde a linha nova com a linha existente", () => {
    expect(idsDe(chaves, "novo-item.", ".foodId")).toEqual(["op1"]);
  });

  it("ignora a chave que é só o prefixo e o sufixo colados", () => {
    expect(idsDe(["padrao.", "padrao.m1"], "padrao.", "")).toEqual(["m1"]);
  });
});

describe("assinaturas", () => {
  it("distingue sem horário de horário em branco", () => {
    expect(assinaturaRefeicao("Almoço", 2, null)).not.toBe(
      assinaturaRefeicao("Almoço", 2, ""),
    );
  });

  it("a tela e a ação chegam na mesma string para o mesmo item", () => {
    // Tela: number vindo do DTO. Ação: o mesmo número, depois de `Number(txt)`.
    const daTela = assinaturaItem("f1", 65, false, "g1");
    const daAcao = assinaturaItem("f1", Number("65"), false, "g1");
    expect(daAcao).toBe(daTela);
  });

  it("item travado e item flexível sem grupo não colidem", () => {
    expect(assinaturaItem("f1", 65, false, "travado")).not.toBe(
      assinaturaItem("f1", 65, false, ""),
    );
  });

  it("marcar à vontade num item que já estava com 0 g é uma mudança", () => {
    // O caso que a flag existe para distinguir (018): sem `adLibitum` na
    // assinatura este salvar seria engolido como "nada mudou".
    expect(assinaturaItem("f1", 0, true, "g1")).not.toBe(
      assinaturaItem("f1", 0, false, "g1"),
    );
  });

  it("a semana muda de assinatura quando um dia troca de tipo", () => {
    const base = ["a", "a", "b", "a", "b", "a", "b"];
    expect(assinaturaSemana(base)).not.toBe(
      assinaturaSemana(["a", "b", "b", "a", "b", "a", "b"]),
    );
  });
});
