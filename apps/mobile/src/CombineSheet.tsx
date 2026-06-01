// US3 — combinação 1→2. Lista os alimentos do grupo (via /substitutions),
// deixa escolher DOIS e ajustar a proporção (split) por passos, e mostra as
// quantidades de cada um (POST /combine), preservando o nutriente-base.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getSubstitutions, postCombine } from "@bamboo/api-client";
import type {
  CombinePartDto,
  MealItemDto,
  SubstitutionAlternativeDto,
} from "@bamboo/types";
import { API_URL } from "./config";
import { formatGrams } from "./format";

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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Combinar em dois</Text>
          {item && (
            <Text style={styles.currentLabel}>
              No lugar de: {item.food.name}
            </Text>
          )}

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
                {cand.cands.map((c) => {
                  const on = selected.includes(c.foodId);
                  return (
                    <Pressable
                      key={c.foodId}
                      style={[styles.candRow, on && styles.candRowOn]}
                      onPress={() => toggle(c.foodId)}
                    >
                      <Text style={[styles.candName, on && styles.candNameOn]}>
                        {on ? "✓ " : ""}
                        {c.name}
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
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => adjust(-0.1)}
                    >
                      <Text style={styles.stepText}>− 1º</Text>
                    </Pressable>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => adjust(0.1)}
                    >
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
                            {p.medidaCaseira
                              ? `${p.medidaCaseira.label} (${formatGrams(p.gramas)})`
                              : formatGrams(p.gramas)}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d0d0d0",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#1a1a1a" },
  currentLabel: { fontSize: 14, color: "#666", marginTop: 4 },
  sectionLabel: {
    fontSize: 13,
    color: "#888",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: { maxHeight: 200 },
  candRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  candRowOn: { backgroundColor: "#e8f5e9" },
  candName: { fontSize: 16, color: "#1a1a1a" },
  candNameOn: { color: "#2e7d32", fontWeight: "600" },
  splitBox: { marginTop: 8 },
  stepperRow: { flexDirection: "row", gap: 12 },
  stepBtn: {
    flex: 1,
    backgroundColor: "#eef",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  stepText: { fontSize: 15, color: "#1565c0", fontWeight: "600" },
  partsBox: { marginTop: 12 },
  partRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  partName: { fontSize: 15, color: "#1a1a1a", flexShrink: 1 },
  partQty: { fontSize: 15, color: "#2e7d32", fontWeight: "600" },
  centerBox: { paddingVertical: 24, alignItems: "center" },
  errorText: { fontSize: 14, color: "#c62828", marginTop: 8 },
  confirmRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#a5d6a7" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#eee",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { color: "#555", fontWeight: "600", fontSize: 16 },
});
