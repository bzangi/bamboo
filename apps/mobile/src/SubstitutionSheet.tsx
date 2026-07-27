// US2 — "substituir num toque". Bottom-sheet via RN Modal (zero deps novas).
// Busca as alternativas do grupo (já com gramas recalculadas + medida caseira)
// e devolve a escolha ao chamador, que aplica a troca em estado LOCAL.
//
// 019: a lista é PAGINADA e cresce conforme a rolagem. O grupo pode ter ~70
// alimentos depois da auto-classificação (008) — mandar tudo de uma vez é render
// e rede que ninguém pediu. Com página, a busca precisa ser do SERVIDOR: filtrar
// só o que já baixou devolveria resultado errado (o alimento pode estar na página
// que ainda não veio).
import { useMemo } from "react";
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
import type { MealItemDto, SubstitutionAlternativeDto } from "@bamboo/types";
import { formatAlternativeQuantity, formatNutrition } from "./format";
import {
  MINIMO_PARA_BUSCAR,
  useAlternativesSearch,
  type AlternativesLoadState,
} from "./useAlternativesSearch";

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

export function SubstitutionSheet({ item, onClose, onSelect }: Props) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { state, termo, setTermo, buscando, carregarMais } =
    useAlternativesSearch(item);

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
        buscando={buscando}
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
  readonly state: AlternativesLoadState;
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
