// US3 — combinação 1→2. Lista os alimentos do grupo (via /substitutions),
// deixa escolher DOIS e ajustar a proporção (split) por passos, e mostra as
// quantidades de cada um (POST /combine), preservando o nutriente-base.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Folha } from "./Folha";
import { radius, space, text, usePalette, type Palette } from "./theme";
import { getSubstitutions, postCombine } from "@bamboo/api-client";
import type {
  CombinePartDto,
  MealItemDto,
  SubstitutionAlternativeDto,
} from "@bamboo/types";
import { API_URL } from "./config";
import { formatQuantidade } from "./format";
import { log } from "./logger";

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

type CandState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly cands: readonly SubstitutionAlternativeDto[];
    };

export function CombineSheet({ item, onClose, onConfirm }: Props) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [cand, setCand] = useState<CandState>({ status: "loading" });
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [split, setSplit] = useState(0.5);
  const [partes, setPartes] = useState<readonly CombinePartDto[] | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Carrega candidatos (foods do grupo) ao abrir.
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setCand({ status: "loading" });
    setSelected([]);
    setSplit(0.5);
    setPartes(null);
    getSubstitutions(API_URL, item.id)
      .then((data) => {
        if (!cancelled) setCand({ status: "ready", cands: data.alternatives });
      })
      .catch((e: unknown) => {
        log.error(
          "CombineSheet",
          `falha ao listar alimentos item=${item.id}`,
          e,
        );
        if (!cancelled)
          setCand({
            status: "error",
            message:
              e instanceof Error ? e.message : "Falha ao listar alimentos.",
          });
      });
    return () => {
      cancelled = true;
    };
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

  return (
    <Folha
      visible={visible}
      onClose={onClose}
      titulo="Combinar em dois"
      legenda={item ? `No lugar de: ${item.food.name}` : undefined}
    >
      {cand.status === "loading" && (
        <View style={styles.centerBox}>
          <ActivityIndicator />
        </View>
      )}
      {cand.status === "error" && (
        <Text style={styles.errorText}>{cand.message}</Text>
      )}
      {cand.status === "ready" && (
        <>
          <Text style={styles.sectionLabel}>Escolha 2 alimentos</Text>
          <ScrollView style={styles.list}>
            {cand.cands.map((alt) => {
              const on = selected.includes(alt.foodId);
              return (
                <Pressable
                  key={alt.foodId}
                  style={[styles.candRow, on && styles.candRowOn]}
                  onPress={() => toggle(alt.foodId)}
                >
                  <Text style={[styles.candName, on && styles.candNameOn]}>
                    {on ? "✓ " : ""}
                    {alt.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    sectionLabel: {
      ...text.label,
      color: c.ink3,
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    list: { maxHeight: 200 },
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
