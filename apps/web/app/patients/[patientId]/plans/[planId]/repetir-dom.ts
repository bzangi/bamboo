// A mecânica das linhas que se repetem: clonar, descartar e RENUMERAR.
//
// Sem JSX de propósito — é a parte com decisão, e num `.ts` ela roda no Vitest.
// O componente (`repetir.tsx`) é só a casca que escuta o clique.
//
// A renumeração é o ponto que quebra calado: duas linhas com o mesmo índice se
// sobrescrevem no FormData e uma some no salvar, sem erro nenhum. Por isso toda
// operação renumera TODAS as linhas de 0 a n-1, em vez de tentar adivinhar o
// próximo índice livre.
//
// COMO a linha sabe qual número é o dela: cada linha declara em `data-slot` o
// prefixo que vem ANTES do seu índice — `nova-op.<mealId>` para a linha de
// opção, `nova-op.<mealId>.0.item` para as linhas de alimento DENTRO dela. A
// renumeração troca só `^<slot>.<dígitos>`, então mexer na opção arrasta os
// nomes dos alimentos dela junto e não encosta no índice deles. Uma regra que
// olhasse "o último número do nome" faria o contrário — e silenciosamente.
//
// `id` e `for` são o próprio `name`: nome de campo já é único por construção, e
// assim não existe um segundo esquema de identificador para manter em dia.

const LINHAS = ":scope > [data-linha-nova]";

const linhasDe = (raiz: Element): HTMLElement[] =>
  Array.from(raiz.querySelectorAll<HTMLElement>(LINHAS));

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Reescreve o índice do slot em `name`, `id`, `for` e nos `data-slot` de
 *  dentro. Os VALORES ficam onde estão: renumerar não pode apagar o que a nutri
 *  já digitou. */
function renomear(linha: HTMLElement, indice: number): void {
  const slot = linha.dataset.slot;
  if (!slot) return;
  const de = new RegExp(`^${escapar(slot)}\\.\\d+`);
  const para = `${slot}.${indice}`;
  const trocar = (v: string) => v.replace(de, para);

  linha.dataset.slot = slot; // o slot da própria linha não tem índice
  for (const campo of Array.from(
    linha.querySelectorAll("[name], [id], [for], [data-slot]"),
  )) {
    if (campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement)
      campo.name = trocar(campo.name);
    if (campo instanceof HTMLElement && campo.id) campo.id = trocar(campo.id);
    if (campo instanceof HTMLLabelElement && campo.htmlFor)
      campo.htmlFor = trocar(campo.htmlFor);
    if (campo instanceof HTMLElement && campo.dataset.slot)
      campo.dataset.slot = trocar(campo.dataset.slot);
  }
}

function limparValores(linha: HTMLElement): void {
  for (const campo of Array.from(
    linha.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    ),
  )) {
    if (campo instanceof HTMLInputElement && campo.type === "checkbox")
      campo.checked = false;
    // `""` num `<select>` cai no convite ("Escolha o alimento…"), que é
    // exatamente o estado de linha em branco.
    else campo.value = "";
  }
}

function renumerar(raiz: Element): void {
  linhasDe(raiz).forEach(renomear);
}

/** Copia a última linha, esvazia a cópia e a põe embaixo. Devolve a nova. */
export function adicionarLinha(raiz: Element): HTMLElement | null {
  const linhas = linhasDe(raiz);
  const ultima = linhas[linhas.length - 1];
  if (!ultima) return null;

  const nova = ultima.cloneNode(true) as HTMLElement;
  limparValores(nova);
  ultima.after(nova);
  renumerar(raiz);
  return nova;
}

/**
 * Tira a linha pendente. A ÚLTIMA que sobrou não é removida, é esvaziada: um
 * bloco sem nenhuma linha em branco deixaria de oferecer o que ele existe para
 * oferecer, e não haveria como trazê-la de volta (o "+" clona uma linha).
 */
export function removerLinha(raiz: Element, alvo: Element): void {
  const linha = alvo.closest<HTMLElement>("[data-linha-nova]");
  if (!linha || linha.parentElement !== raiz) return;

  if (linhasDe(raiz).length <= 1) {
    limparValores(linha);
    return;
  }
  linha.remove();
  renumerar(raiz);
}
