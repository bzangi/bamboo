// US2 — "substituir num toque". Bottom-sheet via RN Modal (zero deps novas).
// Busca as alternativas do grupo (já com gramas recalculadas + medida caseira)
// e devolve a escolha ao chamador, que aplica a troca em estado LOCAL.
//
// 019: a lista é PAGINADA e cresce conforme a rolagem. O grupo pode ter ~70
// alimentos depois da auto-classificação (008) — mandar tudo de uma vez é render
// e rede que ninguém pediu. Com página, a busca precisa ser do SERVIDOR: filtrar
// só o que já baixou devolveria resultado errado (o alimento pode estar na página
// que ainda não veio).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Folha } from "./Folha";
import { radius, space, text, usePalette, type Palette } from "./theme";
import { getSubstitutions } from "@bamboo/api-client";
import type {
  MealItemDto,
  SubstitutionAlternativeDto,
  SubstitutionsResponse,
} from "@bamboo/types";
import { API_URL } from "./config";
import { formatAlternativeQuantity, formatNutrition } from "./format";
import { log } from "./logger";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      // `data.alternatives` ACUMULA as páginas já recebidas.
      readonly data: SubstitutionsResponse;
      readonly fim: boolean;
      readonly carregandoMais: boolean;
    };

interface Props {
  // Item tocado; null = sheet fechado. Só itens substitutable=true chegam aqui.
  readonly item: MealItemDto | null;
  readonly onClose: () => void;
  // Devolve a alternativa escolhida para o pai aplicar a troca (estado local).
  readonly onSelect: (
    item: MealItemDto,
    alternative: SubstitutionAlternativeDto,
  ) => void;
}

/** Abaixo disto o campo de busca é ruído: a lista inteira já cabe na tela. */
const MINIMO_PARA_BUSCAR = 8;

/** Espera de digitação antes de consultar o servidor. */
const DEBOUNCE_MS = 250;

/** Itens por página. */
const PAGINA = 20;

/**
 * Fim da lista = página que voltou com menos itens que o pedido. O endpoint não
 * devolve total, e não precisa: quando o grupo tem múltiplo exato de `PAGINA`,
 * sobra uma requisição que volta vazia e encerra. Uma requisição a mais no caso
 * raro é mais barato que um campo de total em toda resposta.
 */
const fimDaLista = (recebidos: number) => recebidos < PAGINA;

export function SubstitutionSheet({ item, onClose, onSelect }: Props) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [termo, setTermo] = useState("");
  // O termo já "assentado" — é ele que vai à rede, não cada tecla.
  const [busca, setBusca] = useState("");
  // Cada primeira página é uma geração nova; página seguinte que chegar de uma
  // geração velha (o usuário digitou no meio do caminho) é descartada.
  const geracao = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setBusca(termo), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termo]);

  // O sheet não desmonta entre aberturas: sem isto a busca da troca anterior
  // continuaria valendo para o item novo. Zerar DURANTE O RENDER (padrão do
  // "You Might Not Need an Effect") e não num `useEffect`: em efeito, o fetch
  // abaixo dispararia uma vez com o termo velho antes de o reset chegar.
  const [itemAnterior, setItemAnterior] = useState(item);
  if (item !== itemAnterior) {
    setItemAnterior(item);
    setTermo("");
    setBusca("");
  }

  useEffect(() => {
    if (!item) return;
    const minha = ++geracao.current;
    setState({ status: "loading" });

    getSubstitutions(API_URL, item.id, { q: busca, limit: PAGINA })
      .then((data) => {
        if (geracao.current !== minha) return;
        setState({
          status: "ready",
          data,
          fim: fimDaLista(data.alternatives.length),
          carregandoMais: false,
        });
      })
      .catch((e: unknown) => {
        log.error(
          "SubstitutionSheet",
          `falha ao buscar alternativas item=${item.id}`,
          e,
        );
        if (geracao.current !== minha) return;
        const message =
          e instanceof Error ? e.message : "Falha ao buscar alternativas.";
        setState({ status: "error", message });
      });
  }, [item, busca]);

  function carregarMais() {
    if (!item || state.status !== "ready") return;
    if (state.fim || state.carregandoMais) return;

    const minha = geracao.current;
    const jaTem = state.data.alternatives.length;
    setState({ ...state, carregandoMais: true });

    getSubstitutions(API_URL, item.id, {
      q: busca,
      limit: PAGINA,
      offset: jaTem,
    })
      .then((pagina) => {
        if (geracao.current !== minha) return;
        setState((atual) =>
          atual.status === "ready"
            ? {
                ...atual,
                data: {
                  ...atual.data,
                  alternatives: [
                    ...atual.data.alternatives,
                    ...pagina.alternatives,
                  ],
                },
                fim: fimDaLista(pagina.alternatives.length),
                carregandoMais: false,
              }
            : atual,
        );
      })
      .catch((e: unknown) => {
        log.error("SubstitutionSheet", `falha na página offset=${jaTem}`, e);
        if (geracao.current !== minha) return;
        // Falha de página NÃO derruba o que já está na tela: só para de crescer.
        setState((atual) =>
          atual.status === "ready"
            ? { ...atual, fim: true, carregandoMais: false }
            : atual,
        );
      });
  }

  const visible = item !== null;

  return (
    <Folha
      visible={visible}
      onClose={onClose}
      titulo="Trocar alimento"
      legenda={item ? `Atual: ${item.food.name}` : undefined}
      maxHeight="75%"
    >
      <SheetBody
        state={state}
        termo={termo}
        buscando={busca.length > 0}
        onTermo={setTermo}
        onFimDaLista={carregarMais}
        onSelect={(alt) => {
          if (item) onSelect(item, alt);
        }}
      />

      <Pressable
        style={styles.closeButton}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Text style={styles.closeButtonText}>Fechar</Text>
      </Pressable>
    </Folha>
  );
}

function SheetBody({
  state,
  termo,
  buscando,
  onTermo,
  onFimDaLista,
  onSelect,
}: {
  readonly state: LoadState;
  readonly termo: string;
  /** Há termo valendo na consulta atual — muda o texto do estado vazio. */
  readonly buscando: boolean;
  readonly onTermo: (t: string) => void;
  readonly onFimDaLista: () => void;
  readonly onSelect: (alt: SubstitutionAlternativeDto) => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  if (state.status === "error") {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }

  // Enquanto a 1ª página não chega ainda não se sabe o tamanho do grupo — mas se
  // já há termo, o campo TEM de continuar na tela: sem ele o paciente não
  // consegue apagar o que digitou.
  const carregandoPrimeira = state.status === "loading";
  const alternatives = carregandoPrimeira ? [] : state.data.alternatives;
  const mostrarBusca =
    buscando || termo.length > 0 || alternatives.length >= MINIMO_PARA_BUSCAR;

  return (
    <>
      {mostrarBusca && (
        <TextInput
          style={styles.search}
          value={termo}
          onChangeText={onTermo}
          placeholder="Buscar alimento"
          placeholderTextColor={c.ink3}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Buscar alimento entre as alternativas"
        />
      )}

      {carregandoPrimeira ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.hint}>Buscando alternativas…</Text>
        </View>
      ) : (
        <>
          <Text style={styles.groupLabel}>
            Equivalentes em {state.data.group.name}
          </Text>

          <FlatList
            style={styles.list}
            data={alternatives}
            keyExtractor={(alt) => alt.foodId}
            // Sem isto, o 1º toque numa alternativa só fecha o teclado.
            keyboardShouldPersistTaps="handled"
            onEndReached={onFimDaLista}
            onEndReachedThreshold={0.4}
            renderItem={({ item: alt }) => (
              <Alternativa alt={alt} onSelect={onSelect} />
            )}
            // FR-014 / SC-007: ausência de alternativas é mensagem, nunca erro —
            // e "nada casou a busca" é um estado DIFERENTE de "grupo sem
            // substitutos".
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Text style={styles.hint}>
                  {buscando
                    ? `Nenhum alimento com “${termo}”.`
                    : "Sem alternativas neste grupo por enquanto."}
                </Text>
              </View>
            }
            ListFooterComponent={
              state.carregandoMais ? (
                <View style={styles.footer}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
          />
        </>
      )}
    </>
  );
}

function Alternativa({
  alt,
  onSelect,
}: {
  readonly alt: SubstitutionAlternativeDto;
  readonly onSelect: (alt: SubstitutionAlternativeDto) => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const nutritionLine = formatNutrition(alt.nutrition);
  return (
    <Pressable
      style={styles.altRow}
      onPress={() => onSelect(alt)}
      accessibilityRole="button"
    >
      <View style={styles.altMain}>
        <Text style={styles.altName}>{alt.name}</Text>
        <Text style={styles.altQty}>{formatAlternativeQuantity(alt)}</Text>
      </View>
      {nutritionLine && (
        <Text style={styles.altNutrition}>{nutritionLine}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    search: {
      marginTop: space.lg,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.sm,
      backgroundColor: c.muted,
      paddingHorizontal: space.md,
      paddingVertical: 11,
      ...text.body,
      color: c.ink,
    },
    groupLabel: {
      ...text.label,
      color: c.ink3,
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    list: { marginBottom: space.sm },
    footer: { paddingVertical: space.lg },
    altRow: {
      paddingVertical: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    altMain: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    altName: {
      ...text.body,
      color: c.ink,
      flexShrink: 1,
      paddingRight: space.md,
    },
    altQty: { ...text.value, color: c.feito },
    altNutrition: { ...text.small, color: c.ink3, marginTop: space.xs },
    centerBox: {
      paddingVertical: space.xxl,
      alignItems: "center",
      gap: space.sm,
    },
    hint: { ...text.small, color: c.ink2, textAlign: "center" },
    errorText: { ...text.small, color: c.pulei, textAlign: "center" },
    closeButton: {
      marginTop: space.sm,
      paddingVertical: space.md,
      alignItems: "center",
    },
    closeButtonText: { ...text.body, color: c.troquei, fontWeight: "600" },
  });
