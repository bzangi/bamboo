// O DIFF do formulário do editor: o que a revisão antes de salvar mostra.
//
// Sem JSX de propósito — é o pedaço com decisão, e num `.ts` ele roda no Vitest
// (o `jsx: preserve` do Next impede o esbuild do Vitest de ler um `.tsx`).
//
// O diff é lido do DOM, não de um espelho do plano em JSON: cada campo editável
// carrega `data-rotulo` (o que é) e `data-orig` (o que era, renderizado pelo
// servidor). Assim não existe uma segunda cópia do plano para divergir da tela.

/** `de: null` = adição · `para: null` = remoção · ambos = alteração. */
export type Mudanca = {
  readonly rotulo: string;
  readonly de: string | null;
  readonly para: string | null;
};

/** O valor EXIBIDO de um campo: o que a nutri leu na tela, não o UUID que vai
 *  no fio. Para `<select>` isso é o texto da opção, não o `value`. */
function visivel(el: Element): string {
  // `options[selectedIndex]`, não `selectedOptions[0]`: a segunda é uma coleção
  // derivada e nem toda implementação a recalcula quando a escolha muda.
  if (el instanceof HTMLSelectElement)
    return el.options[el.selectedIndex]?.text.trim() ?? "";
  if (el instanceof HTMLInputElement) return el.value.trim();
  return "";
}

/** Quantidade é um par (checkbox "à vontade" + gramas) que na tela é UM dado:
 *  marcado, o número deixa de valer. O diff diz "125 g → à vontade", não duas
 *  linhas contraditórias. */
function quantidade(campo: HTMLInputElement): string {
  const aVontade = campo.parentElement?.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (aVontade?.checked) return "à vontade";
  const g = campo.value.trim();
  return g.length === 0 ? "" : `${g} g`;
}

function valorAtual(el: Element): string {
  if (el instanceof HTMLInputElement && el.dataset.quantidade !== undefined)
    return quantidade(el);
  // Rádio (opção padrão): o valor que interessa é o rótulo da opção escolhida.
  if (el instanceof HTMLElement && el.dataset.valor !== undefined)
    return el.dataset.valor;
  return visivel(el);
}

/**
 * O campo está VAZIO? Para `<select>` a resposta é o `value`, nunca o texto: a
 * primeira opção é o convite ("Escolha o alimento…"), que tem texto e não é
 * escolha nenhuma — foi assim que toda opção sem alimento virava "novo item".
 */
function vazio(el: Element): boolean {
  if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement)
    return el.value.trim().length === 0;
  return true;
}

export function diff(form: HTMLFormElement): Mudanca[] {
  const out: Mudanca[] = [];
  // Mudanças no MESMO nó viram UMA linha: trocar o alimento e a quantidade do
  // mesmo item é uma edição só na cabeça de quem edita, e duas linhas fazem
  // procurar de qual item é cada uma.
  const porGrupo = new Map<string, number>();

  for (const el of Array.from(form.querySelectorAll("[data-rotulo]"))) {
    if (!(el instanceof HTMLElement)) continue;
    const rotulo = el.dataset.rotulo ?? "";
    const marcavel = el instanceof HTMLInputElement && el.type !== "text";

    // Remoção: o "excluir" é uma marcação que só vira DELETE no salvar, então
    // ela cabe nesta lista como qualquer outra mudança pendente.
    if (el.dataset.remover !== undefined) {
      if (marcavel && el.checked) out.push({ rotulo, de: rotulo, para: null });
      continue;
    }
    // Grupo de rádio: só o marcado responde pelo grupo.
    if (el instanceof HTMLInputElement && el.type === "radio" && !el.checked)
      continue;

    const atual = valorAtual(el);

    // Linha em branco no fim de uma lista: preenchida, é uma adição.
    if (el.dataset.novo !== undefined) {
      if (vazio(el)) continue;
      const linha = el.closest("[data-linha-nova]");
      const qtd = linha?.querySelector<HTMLInputElement>("[data-quantidade]");
      const q = qtd ? quantidade(qtd) : "";
      out.push({
        rotulo,
        de: null,
        para: q.length > 0 ? `${atual} — ${q}` : atual,
      });
      continue;
    }

    const orig = el.dataset.orig ?? "";
    if (atual === orig) continue;

    const grupo = el.dataset.grupo;
    const jaTem = grupo === undefined ? undefined : porGrupo.get(grupo);
    if (jaTem === undefined) {
      if (grupo !== undefined) porGrupo.set(grupo, out.length);
      out.push({ rotulo, de: orig, para: atual });
      continue;
    }
    const anterior = out[jaTem];
    if (anterior === undefined) continue;
    out[jaTem] = {
      rotulo: anterior.rotulo,
      de: `${anterior.de ?? ""} · ${orig}`,
      para: `${anterior.para ?? ""} · ${atual}`,
    };
  }
  return out;
}
