// US2 — "substituir num toque". Bottom-sheet via RN Modal (zero deps novas).
// Busca as alternativas do grupo (já com gramas recalculadas + medida caseira)
// e devolve a escolha ao chamador, que aplica a troca em estado LOCAL.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getSubstitutions } from "@bamboo/api-client";
import type {
  MealItemDto,
  SubstitutionAlternativeDto,
  SubstitutionsResponse,
} from "@bamboo/types";
import { API_URL } from "./config";
import { formatAlternativeQuantity } from "./format";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: SubstitutionsResponse };

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
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setState({ status: "loading" });

    getSubstitutions(API_URL, item.id)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : "Falha ao buscar alternativas.";
          setState({ status: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  const visible = item !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop: tocar fora fecha o sheet. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Card do sheet: para o toque não vazar para o backdrop. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Trocar alimento</Text>
          {item && (
            <Text style={styles.currentLabel}>
              Atual: {item.food.name}
            </Text>
          )}

          <SheetBody
            state={state}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetBody({
  state,
  onSelect,
}: {
  readonly state: LoadState;
  readonly onSelect: (alt: SubstitutionAlternativeDto) => void;
}) {
  if (state.status === "loading") {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator />
        <Text style={styles.hint}>Buscando alternativas…</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }

  const { group, alternatives } = state.data;

  // FR-014 / SC-007: ausência de alternativas é mensagem, nunca erro.
  if (alternatives.length === 0) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.hint}>
          Sem alternativas neste grupo por enquanto.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.groupLabel}>Equivalentes em {group.name}</Text>
      <ScrollView style={styles.list}>
        {alternatives.map((alt) => (
          <Pressable
            key={alt.foodId}
            style={styles.altRow}
            onPress={() => onSelect(alt)}
            accessibilityRole="button"
          >
            <Text style={styles.altName}>{alt.name}</Text>
            <Text style={styles.altQty}>{formatAlternativeQuantity(alt)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
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
    maxHeight: "75%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d0d0d0",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  currentLabel: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  groupLabel: {
    fontSize: 13,
    color: "#888",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: {
    marginBottom: 8,
  },
  altRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  altName: {
    fontSize: 16,
    color: "#1a1a1a",
    flexShrink: 1,
    paddingRight: 12,
  },
  altQty: {
    fontSize: 15,
    color: "#2e7d32",
    fontWeight: "600",
  },
  centerBox: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  hint: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#c62828",
    textAlign: "center",
  },
  closeButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: "#1565c0",
    fontWeight: "600",
  },
});
