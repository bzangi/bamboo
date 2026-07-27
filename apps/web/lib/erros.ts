// Falha de escrita → CÓDIGO na URL → frase fixa na tela.
//
// Por que código e não a mensagem da API (herdado da 016): um parâmetro de texto
// refletido na página deixa qualquer um montar uma URL que exibe a frase que
// quiser dentro da tela da nutri — vetor de phishing, não de XSS (o React
// escapa). Então nada que vem de fora é impresso: a página só sabe traduzir um
// código de um conjunto FECHADO.
//
// O código é derivado de (status HTTP, entidade) — as duas coisas que a Server
// Action sabe sem inspecionar texto. A frase nomeia as causas reais daquele 409,
// que é o que a nutri precisa para agir.
//
// ponytail: a frase de 409 lista as causas possíveis em vez de dizer a exata,
// porque a exata só existe na mensagem da API e essa não pode ser refletida. Se a
// precisão passar a doer, o próximo passo é uma ilha client com `useActionState`
// (o valor volta pelo retorno da action, não pela URL) — não relaxar isto aqui.

export type CodigoDeFalha = keyof typeof FRASES;

export const FRASES = {
  // Estrutural — o formulário mandou algo que a API recusou na borda.
  invalido:
    "Algum campo está inválido. Confira os valores e envie de novo — números têm de ser maiores que zero e os textos não podem ficar em branco.",
  "nome-invalido": "Nome inválido. Digite de 1 a 120 caracteres.",
  "ficha-invalida":
    "Algum campo da ficha está inválido: o nome precisa ter de 1 a 120 caracteres, e altura e peso precisam ser números maiores que zero (ou ficar em branco).",
  "semana-invalida":
    "A programação da semana precisa cobrir os sete dias, cada um com um tipo-de-dia.",

  // 409 — conflito, por entidade.
  "conflito-paciente":
    "Não foi possível excluir o paciente: ele tem registro de refeição, e o histórico não é apagado por exclusão de cadastro.",
  "conflito-plano":
    "Não foi possível excluir o plano. Ele tem registro de refeição, tem vigência em algum ciclo, ou é o plano ativo de um paciente com ciclo aberto. Crie um plano novo em vez de apagar este.",
  "conflito-tipo-de-dia":
    "Não foi possível excluir o tipo-de-dia. Ou ele está na programação da semana (reprograme a semana primeiro), ou há registro em uma das refeições dele.",
  "conflito-refeicao":
    "Não foi possível excluir a refeição: há registro de refeição nela. Edite as opções em vez de apagá-la.",
  "conflito-opcao":
    "Não foi possível excluir ou desmarcar a opção. Ou ela é a única da refeição, ou é a padrão (marque outra como padrão antes), ou algum registro aponta para ela.",
  "conflito-posicao":
    "Já existe uma refeição nessa posição deste tipo-de-dia. A posição é o que pareia as refeições entre tipos-de-dia — duas na mesma quebraria a troca de tipo-de-dia.",
  // Os dois 400 do item numa frase: gramas fora de faixa e a marcação
  // contraditória. Um 400 por causa não é distinguível daqui sem refletir a
  // mensagem da API, e refletir é o que este arquivo existe para não fazer.
  "conflito-item":
    "O item não foi salvo. As gramas têm de ser um número entre 1 e 5000; e item travado não pode ter grupo de substituição ao mesmo tempo — travado não troca, então escolha um dos dois.",

  // 422 — regra de negócio que depende do banco.
  "fora-do-grupo":
    "Esse alimento não participa do grupo escolhido. Sem a porção de referência do vínculo, a troca não sabe recalcular a quantidade — vincule o alimento ao grupo primeiro.",
  "tipo-de-outro-plano":
    "A programação aponta para um tipo-de-dia que não é deste plano.",
  "sem-nutricionista":
    "Não há exatamente uma nutricionista cadastrada. Rode o seed do banco — com a credencial stub o sistema não sabe qual seria a responsável.",

  // Infra.
  "nao-encontrado":
    "O que você tentou alterar não existe mais. Recarregue a página.",
  api: "Não foi possível concluir agora. Confira se a API está no ar e tente de novo.",
} as const;

/**
 * O que a ação estava mexendo. NÃO é só a tabela: é o par (nó, operação) quando
 * as duas operações do mesmo nó falham por motivos diferentes no MESMO status.
 *
 * Foi o smoke que provou a necessidade: criar refeição e excluir refeição os dois
 * respondem 409, mas por causas opostas — posição ocupada e "tem registro". Com
 * uma entidade só, a tela mostrava a frase do registro quando o problema era a
 * posição, o que manda a nutri procurar o erro no lugar errado.
 */
export type Entidade =
  | "paciente"
  | "plano"
  | "tipo-de-dia"
  | "refeicao-posicao" // criar/mover refeição: 409 = posição ocupada
  | "refeicao" // excluir refeição: 409 = tem registro
  | "opcao"
  | "item"
  | "semana"
  | "alimento"
  | "grupo";

const CONFLITO: Partial<Record<Entidade, CodigoDeFalha>> = {
  paciente: "conflito-paciente",
  plano: "conflito-plano",
  "tipo-de-dia": "conflito-tipo-de-dia",
  "refeicao-posicao": "conflito-posicao",
  refeicao: "conflito-refeicao",
  opcao: "conflito-opcao",
  item: "conflito-item",
};

const REGRA: Partial<Record<Entidade, CodigoDeFalha>> = {
  item: "fora-do-grupo",
  semana: "tipo-de-outro-plano",
  grupo: "sem-nutricionista",
};

/** 400 é estrutural, mas em dois nós ele tem uma causa NOMEÁVEL. */
const ESTRUTURAL: Partial<Record<Entidade, CodigoDeFalha>> = {
  semana: "semana-invalida",
  item: "conflito-item",
  paciente: "ficha-invalida",
};

/**
 * (status, entidade) → código. Nenhuma inspeção de texto: casar mensagem da API
 * por substring quebraria calado no dia em que ela reescrevesse uma frase.
 */
export function codigo(status: number, entidade: Entidade): CodigoDeFalha {
  if (status === 404) return "nao-encontrado";
  if (status === 409) return CONFLITO[entidade] ?? "conflito-plano";
  if (status === 422) return REGRA[entidade] ?? "invalido";
  if (status === 400) return ESTRUTURAL[entidade] ?? "invalido";
  return "api";
}

/**
 * A frase, ou a genérica quando o código não é um dos nossos (URL editada à mão).
 *
 * `Object.hasOwn`, NÃO `cod in FRASES`: o `in` anda pela cadeia de protótipos, e
 * `?erro=constructor` devolveria `Object.prototype.constructor` — uma função onde
 * a tela espera texto. Mesma armadilha do `hasOwnProperty` no `presente()` da API.
 */
export function frase(cod: string | undefined): string | null {
  if (!cod) return null;
  return Object.hasOwn(FRASES, cod) ? FRASES[cod as CodigoDeFalha] : FRASES.api;
}
