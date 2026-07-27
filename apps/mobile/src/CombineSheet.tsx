// US3 — combinação 1→2. Lista os alimentos do grupo (via /substitutions, com
// includeSelf — 021), deixa escolher DOIS e ajustar a proporção (split) por
// passos, e mostra as quantidades de cada um (POST /combine), preservando o
// nutriente-base.
//
// 021: busca + paginação via `useAlternativesSearch` — o mesmo hook do
// `SubstitutionSheet` (019), porque o grupo pode ter ~70 alimentos e a seleção
// aqui é só o CHECKBOX que muda (single-select lá, até 2 aqui).
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { postCombine } from "@bamboo/api-client";
import type {
  CombinePartDto,
  MealItemDto,
  SubstitutionAlternativeDto,
} from "@bamboo/types";
import { API_URL } from "./config";
import { formatQuantidade } from "./format";
import { log } from "./logger";
import {
  MINIMO_PARA_BUSCAR,
  useAlternativesSearch,
} from "./useAlternativesSearch";

interface Props {
  // Item flexível a combinar; null = fechado.
  readonly item: MealItemDto | null;
  readonly onClose: () => void;
  // Confirma a combinação: o pai substitui o item por "A + B" (estado local).
  readonly onConfirm: (
    item: MealItemDto,
    partes: readonly CombinePartDto[],
  ) => void;
}

export function CombineSheet({ item, onClose, onConfirm }: Props) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { state, termo, setTermo, buscando, carregarMais } =
    useAlternativesSearch(item, { includeSelf: true });
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [split, setSplit] = useState(0.5);
  const [partes, setPartes] = useState<readonly CombinePartDto[] | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Item novo (ou sheet fechado) zera a seleção — a lista de candidatos quem
  // resolve é o hook.
  useEffect(() => {
    setSelected([]);
    setSplit(0.5);
    setPartes(null);
  }, [item]);

  // Recalcula a combinação quando há 2 selecionados ou o split muda.
  useEffect(() => {
    if (!item || selected.length !== 2) {
      setPartes(null);
      return;
    }
    let cancelled = false;
    setCalcError(null);
    postCombine(API_URL, item.id, { alvoFoodIds: [...selected], split })
      .then((data) => {
        if (!cancelled) setPartes(data.partes);
      })
      .catch((e: unknown) => {
        log.error(
          "CombineSheet",
          `falha ao calcular combinação item=${item.id}`,
          e,
        );
        if (!cancelled)
          setCalcError(
            e instanceof Error ? e.message : "Falha ao calcular a combinação.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [item, selected, split]);

  const toggle = useCallback((foodId: string) => {
    setSelected((prev) => {
      if (prev.includes(foodId)) return prev.filter((id) => id !== foodId);
      if (prev.length >= 2) return [prev[1]!, foodId]; // mantém os 2 últimos
      return [...prev, foodId];
    });
  }, []);

  const adjust = useCallback((delta: number) => {
    setSplit((s) =>
      Math.min(0.9, Math.max(0.1, Math.round((s + delta) * 10) / 10)),
    );
  }, []);

  const visible = item !== null;
  const carregandoPrimeira = state.status === "loading";
  const alternatives = state.status === "ready" ? state.data.alternatives : [];
  const mostrarBusca =
    buscando || termo.length > 0 || alternatives.length >= MINIMO_PARA_BUSCAR;

  return (
    <Folha
      visible={visible}
      onClose={onClose}
      titulo="Combinar em dois"
      legenda={item ? `No lugar de: ${item.food.name}` : undefined}
    >
      {state.status === "error" && (
        <Text style={styles.errorText}>{state.message}</Text>
      )}
      {state.status !== "error" && (
        <>
          <Text style={styles.sectionLabel}>Escolha 2 alimentos</Text>

          {mostrarBusca && (
            <TextInput
              style={styles.search}
              value={termo}
              onChangeText={setTermo}
              placeholder="Buscar alimento"
              placeholderTextColor={c.ink3}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              accessibilityLabel="Buscar alimento entre os candidatos"
            />
          )}

          {carregandoPrimeira ? (
            <View style={styles.centerBox}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              style={styles.list}
              data={alternatives}
              keyExtractor={(alt) => alt.foodId}
              keyboardShouldPersistTaps="handled"
              onEndReached={carregarMais}
              onEndReachedThreshold={0.4}
              renderItem={({ item: alt }) => (
                <Candidato alt={alt} selected={selected} onToggle={toggle} />
              )}
              ListEmptyComponent={
                <View style={styles.centerBox}>
                  <Text style={styles.hint}>
                    {buscando
                      ? `Nenhum alimento com "${termo}".`
                      : "Sem alternativas neste grupo por enquanto."}
                  </Text>
                </View>
              }
              ListFooterComponent={
                state.status === "ready" && state.carregandoMais ? (
                  <View style={styles.footer}>
                    <ActivityIndicator />
                  </View>
                ) : null
              }
            />
          )}

          {selected.length === 2 && (
            <View style={styles.splitBox}>
              <Text style={styles.sectionLabel}>
                Proporção {Math.round(split * 100)} /{" "}
                {Math.round((1 - split) * 100)}
              </Text>
              <View style={styles.stepperRow}>
                <Pressable style={styles.stepBtn} onPress={() => adjust(-0.1)}>
                  <Text style={styles.stepText}>− 1º</Text>
                </Pressable>
                <Pressable style={styles.stepBtn} onPress={() => adjust(0.1)}>
                  <Text style={styles.stepText}>+ 1º</Text>
                </Pressable>
              </View>

              {calcError ? (
                <Text style={styles.errorText}>{calcError}</Text>
              ) : partes ? (
                <View style={styles.partsBox}>
                  {partes.map((p) => (
                    <View key={p.food.id} style={styles.partRow}>
                      <Text style={styles.partName}>{p.food.name}</Text>
                      <Text style={styles.partQty}>
                        {formatQuantidade(p.gramas, p.medidaCaseira)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <ActivityIndicator style={{ marginTop: 12 }} />
              )}
            </View>
          )}
        </>
      )}

      <View style={styles.confirmRow}>
        <Pressable style={styles.secondaryBtn} onPress={onClose}>
          <Text style={styles.secondaryText}>Cancelar</Text>
        </Pressable>
        <Pressable
          style={[
            styles.primaryBtn,
            (!partes || calcError) && styles.primaryBtnDisabled,
          ]}
          disabled={!partes || calcError !== null}
          onPress={() => {
            if (item && partes) onConfirm(item, partes);
          }}
        >
          <Text style={styles.primaryText}>Usar combinação</Text>
        </Pressable>
      </View>
    </Folha>
  );
}

function Candidato({
  alt,
  selected,
  onToggle,
}: {
  readonly alt: SubstitutionAlternativeDto;
  readonly selected: readonly string[];
  readonly onToggle: (foodId: string) => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const on = selected.includes(alt.foodId);
  return (
    <Pressable
      style={[styles.candRow, on && styles.candRowOn]}
      onPress={() => onToggle(alt.foodId)}
      accessibilityRole="button"
    >
      <Text style={[styles.candName, on && styles.candNameOn]}>
        {on ? "✓ " : ""}
        {alt.name}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sectionLabel: {
      ...text.label,
      color: c.ink3,
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    search: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.sm,
      backgroundColor: c.muted,
      paddingHorizontal: space.md,
      paddingVertical: 11,
      marginBottom: space.sm,
      ...text.body,
      color: c.ink,
    },
    list: { maxHeight: 260 },
    footer: { paddingVertical: space.md },
    hint: { ...text.small, color: c.ink2, textAlign: "center" },
    candRow: {
      paddingVertical: space.md,
      paddingHorizontal: space.md,
      borderRadius: radius.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    candRowOn: { backgroundColor: c.muted },
    candName: { ...text.body, color: c.ink },
    candNameOn: { color: c.feito, fontWeight: "600" },
    splitBox: { marginTop: space.sm },
    stepperRow: { flexDirection: "row", gap: space.md },
    stepBtn: {
      flex: 1,
      backgroundColor: c.muted,
      borderRadius: radius.pill,
      paddingVertical: 11,
      alignItems: "center",
    },
    stepText: { ...text.value, color: c.troquei },
    partsBox: { marginTop: space.md },
    partRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    partName: { ...text.value, fontWeight: "400", color: c.ink, flexShrink: 1 },
    partQty: { ...text.value, color: c.feito },
    centerBox: { paddingVertical: space.xl, alignItems: "center" },
    errorText: { ...text.small, color: c.pulei, marginTop: space.sm },
    confirmRow: { flexDirection: "row", gap: space.md, marginTop: space.lg },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.feito,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: "center",
    },
    // Desabilitado por OPACIDADE, não por um verde claro inventado: um segundo
    // verde na paleta seria uma cor a mais para validar, e no modo escuro o
    // "verde claro" viraria o mais brilhante da tela.
    primaryBtnDisabled: { opacity: 0.4 },
    primaryText: { ...text.body, color: c.onColor, fontWeight: "700" },
    secondaryBtn: {
      flex: 1,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: "center",
    },
    secondaryText: { ...text.body, color: c.ink2, fontWeight: "600" },
  });
