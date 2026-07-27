// Os PEDAÇOS de campo do editor de plano, compartilhados entre a página (Server
// Component) e as linhas novas (ilha client, `novos.tsx`).
//
// Módulo sem diretiva de propósito: quem importa decide em qual grafo ele
// compila. Se isto morasse no `page.tsx`, importá-lo do lado client arrastaria a
// página inteira; se morasse num arquivo `"use client"`, a leitura do plano
// deixaria de ser HTML puro.

import type { GrupoDto, PlanoItemDto } from "@bamboo/types";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** O valor que o `orig.` guarda: a assinatura tem de casar, campo a campo, com a
 *  que `salvarTudo` remonta do FormData — senão o lote manda escrita à toa (ou,
 *  pior, deixa de mandar a que importa). */
export function Original({ chave, valor }: { chave: string; valor: string }) {
  return <input type="hidden" name={`orig.${chave}`} value={valor} />;
}

export function IconeLixeira() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M10 4.5h4M6.5 7l.9 12.2h9.2L17.5 7M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

export function IconeVoltar() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h9a5.5 5.5 0 0 1 0 11h-4M4 8l4-4M4 8l4 4" />
    </svg>
  );
}

/**
 * A lixeirinha: um CHECKBOX, não um botão que apaga na hora.
 *
 * Exclusão instantânea no meio de um formulário que só salva no fim é a única
 * coisa da tela que não dava para desfazer fechando a página — e ficaria de
 * fora da revisão, que é justamente onde "refeição removida" precisa aparecer.
 * Marcada, a linha esmaece e a lixeira acende; quem apaga é o salvar.
 *
 * `sr-only` no input e o ícone no `<label>`: o alvo de clique é o rótulo
 * inteiro, e o estado marcado é visível por `has-[:checked]` — CSS, sem JS.
 */
export function Remover({ alvo, rotulo }: { alvo: string; rotulo: string }) {
  return (
    <label
      title={`${rotulo} ao salvar — clique de novo para desfazer`}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icone" }),
        "shrink-0 text-subtle hover:bg-destructive/10 hover:text-destructive",
        // Marcada, ela deixa de ser "excluir" e passa a ser "desfazer" — e fica
        // TÃO acesa quanto o "+", porque numa linha esmaecida ela é o único
        // controle que ainda responde.
        "has-[:checked]:border has-[:checked]:border-border has-[:checked]:bg-card has-[:checked]:text-foreground has-[:checked]:hover:bg-muted has-[:checked]:hover:text-foreground",
      )}
    >
      <input
        type="checkbox"
        name="remover"
        value={alvo}
        data-remover=""
        data-rotulo={rotulo}
        aria-label={rotulo}
        className="peer sr-only"
      />
      {/* Os dois ícones convivem e o `peer-checked` escolhe: trocar ícone por
          estado não precisa de JavaScript, e o ícone tem de dizer o que o
          PRÓXIMO clique faz — lixeira vermelha numa linha já marcada sugeria
          apagar de novo. */}
      <span className="peer-checked:hidden">
        <IconeLixeira />
      </span>
      <span className="hidden peer-checked:block">
        <IconeVoltar />
      </span>
    </label>
  );
}

/** A marcação de flexibilidade como UM controle de três formas: livre, travado, ou
 *  flexível dentro de um grupo. Dois controles separados (`isLocked` + grupo)
 *  permitiriam a combinação que a API recusa com 400 — aqui ela é inexpressável. */
export function Flexibilidade({
  id,
  name,
  grupos,
  item,
  onde,
  grupo,
}: {
  id: string;
  name: string;
  grupos: ReadonlyArray<GrupoDto>;
  item?: PlanoItemDto;
  /** Onde este campo vive, para a revisão nomear a mudança. */
  onde?: string;
  grupo?: string;
}) {
  return (
    <Select
      id={id}
      name={name}
      defaultValue={flexValor(item)}
      title={flexExibido(item) || undefined}
      data-rotulo={onde}
      data-orig={onde ? flexExibido(item) : undefined}
      data-grupo={grupo}
      className="w-52"
    >
      <option value="">{FLEX_LIVRE}</option>
      <option value="travado">{FLEX_TRAVADO}</option>
      {grupos.map((g) => (
        <option key={g.id} value={g.id}>
          {flexTrocaEm(g.name)}
        </option>
      ))}
    </Select>
  );
}
export const FLEX_LIVRE = "Flexível, sem grupo";
export const FLEX_TRAVADO = "Travado (não troca)";
export const flexTrocaEm = (grupo: string) => `Troca dentro de: ${grupo}`;

/** O que o `<select>` de flexibilidade EXIBE hoje — o `data-orig` da revisão
 *  compara texto com texto, então tem de sair das mesmas frases das `<option>`. */
export const flexExibido = (item?: PlanoItemDto): string => {
  if (!item) return "";
  if (item.isLocked) return FLEX_TRAVADO;
  return item.substitutionGroupName
    ? flexTrocaEm(item.substitutionGroupName)
    : FLEX_LIVRE;
};

export const flexValor = (item?: PlanoItemDto): string =>
  item?.isLocked ? "travado" : (item?.substitutionGroupId ?? "");

export const flexTexto = (item: PlanoItemDto): string =>
  item.isLocked
    ? "travado"
    : (item.substitutionGroupName ?? "flexível, sem grupo");

/**
 * Quantidade: gramas OU "à vontade" (018).
 *
 * Um checkbox ao lado do campo, e não um `0` mágico digitado — 0 g é como a API
 * grava, não é o que a nutri quer dizer. Marcado, o campo de gramas apaga
 * (`peer-checked`, CSS puro): a tela mostra que aquele número deixou de valer,
 * mesmo sem JavaScript para desabilitá-lo. Quem decide é o checkbox, dos dois
 * lados — a ação zera as gramas e a API também.
 *
 * `min={0}` e não `min={1}`: item à vontade JÁ está gravado com 0, e o navegador
 * barrava o formulário inteiro num valor que a API considera correto. Quem
 * recusa 0 sem "à vontade" continua sendo a API — lá a regra é uma só.
 */
export const quantidadeExibida = (item: PlanoItemDto): string =>
  item.adLibitum ? "à vontade" : `${item.quantityGrams} g`;

export function Quantidade({
  prefixo,
  item,
  onde,
  grupo,
}: {
  prefixo: string;
  item?: PlanoItemDto;
  onde?: string;
  grupo?: string;
}) {
  // Os ids saem do `name`, que já é único — e é o que o clone renumera junto.
  const idGramas = `${prefixo}.quantityGrams`;
  const idVontade = `${prefixo}.aVontade`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={idGramas}>Quantidade</Label>
      {/* Os três são IRMÃOS de propósito: o `peer-checked` do campo de gramas é
          o seletor `~` do CSS, que só enxerga irmão — checkbox dentro do
          `<label>` deixaria de alcançá-lo. */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={idVontade}
          name={`${prefixo}.aVontade`}
          value="1"
          defaultChecked={item?.adLibitum ?? false}
          className="peer accent-[var(--feito)]"
        />
        <label
          htmlFor={idVontade}
          className="cursor-pointer text-xs whitespace-nowrap text-muted-foreground"
          title="Item sem quantidade prescrita: salada, verduras."
        >
          à vontade
        </label>
        <Input
          id={idGramas}
          name={`${prefixo}.quantityGrams`}
          type="number"
          step="1"
          min="0"
          max="5000"
          defaultValue={item ? item.quantityGrams : undefined}
          placeholder="g"
          aria-label="Gramas"
          data-quantidade=""
          data-rotulo={onde}
          data-orig={item && onde ? quantidadeExibida(item) : undefined}
          data-grupo={grupo}
          className="w-20 transition-opacity peer-checked:opacity-30"
        />
      </div>
    </div>
  );
}

/**
 * Os dois botões da linha pendente: "+" põe outra igual embaixo, o "voltar"
 * descarta esta. `type="button"` nos dois — aqui não se salva nada, e o salvar
 * continua sendo um só.
 *
 * O "+" aparece SÓ na última linha e o "voltar" só nas outras: a última é a
 * linha em branco que espera ser preenchida (não há o que descartar nela), e um
 * "+" por linha não diria onde a próxima vai nascer.
 *
 * E o "+" fica DESABILITADO enquanto a linha atual está vazia: sem isso dá para
 * empilhar cinco linhas em branco, que o salvar descarta em silêncio — a nutri
 * preenche a terceira, salva, e não entende por que as outras não viraram nada.
 *
 * Não é a mesma lixeirinha do nó GRAVADO: lá ela marca para excluir no salvar;
 * aqui não há o que marcar, a linha ainda não existe em lugar nenhum — por isso
 * o ícone é o de desfazer, não o de apagar.
 */
export function BotoesDaLinha({
  o_que,
  ultima,
  podeAdicionar,
  onAdicionar,
  onDescartar,
  className,
}: {
  o_que: string;
  ultima: boolean;
  /** A linha atual já tem conteúdo? Vazia, não há o que continuar. */
  podeAdicionar: boolean;
  onAdicionar: () => void;
  onDescartar: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-1", className)}
      // No wrapper e não no botão: `disabled` desliga os eventos de ponteiro, e
      // com eles o tooltip que explica por que o botão está apagado.
      title={
        ultima && !podeAdicionar
          ? `Preencha este ${o_que} para adicionar outro`
          : undefined
      }
    >
      {ultima ? (
        <button
          type="button"
          onClick={onAdicionar}
          disabled={!podeAdicionar}
          title={podeAdicionar ? `Adicionar outro ${o_que}` : undefined}
          aria-label={`Adicionar outro ${o_que}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "icone" }),
            "text-lg leading-none",
          )}
        >
          +
        </button>
      ) : (
        <button
          type="button"
          onClick={onDescartar}
          title={`Descartar este ${o_que}`}
          aria-label={`Descartar este ${o_que}`}
          className={cn(buttonVariants({ variant: "outline", size: "icone" }))}
        >
          <IconeVoltar />
        </button>
      )}
    </div>
  );
}
