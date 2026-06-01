// US3 — folha de PRÉVIA do rebalanceamento (gatilho P1). Ao escolher uma opção
// diferente da default, chama POST /rebalance/option-choice e mostra a
// consequência nas refeições seguintes ANTES de confirmar ("avisa, não
// surpreende"). recusa-orientada vira orientação (não erro). Ação, não número.
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
import { postOptionChoice } from "@bamboo/api-client";
import type {
  MealDto,
  MealOptionDto,
  OptionChoiceResponse,
  RebalanceOutcomeDto,
} from "@bamboo/types";
import { API_URL, PATIENT_ID } from "./config";
import { formatGrams } from "./format";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: OptionChoiceResponse };

interface Props {
  // Refeição-gatilho + opção escolhida; null = fechado.
  readonly meal: MealDto | null;
  readonly option: MealOptionDto | null;
  readonly onClose: () => void;
  // Confirma a troca: o pai aplica a escolha + os ajustes (estado local).
  readonly onConfirm: (
    option: MealOptionDto,
    outcome: RebalanceOutcomeDto,
  ) => void;
}

export function RebalancePreviewSheet({
  meal,
  option,
  onClose,
  onConfirm,
}: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!meal || !option || !PATIENT_ID) return;
    let cancelled = false;
    setState({ status: "loading" });
    postOptionChoice(API_URL, PATIENT_ID, {
      triggerMealId: meal.id,
      chosenOptionId: option.id,
    })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : "Falha ao calcular a prévia.";
          setState({ status: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meal, option]);

  const visible = meal !== null && option !== null;

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
          <Text style={styles.title}>{option?.label ?? "Trocar opção"}</Text>

          <Body
            state={state}
            mealName={meal?.name ?? ""}
            onConfirm={(outcome) => {
              if (option) onConfirm(option, outcome);
            }}
            onClose={onClose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Body({
  state,
  mealName,
  onConfirm,
  onClose,
}: {
  readonly state: LoadState;
  readonly mealName: string;
  readonly onConfirm: (outcome: RebalanceOutcomeDto) => void;
  readonly onClose: () => void;
}) {
  if (state.status === "loading") {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator />
        <Text style={styles.hint}>Calculando o efeito no resto do dia…</Text>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable style={styles.secondaryBtn} onPress={onClose}>
          <Text style={styles.secondaryText}>Fechar</Text>
        </Pressable>
      </View>
    );
  }

  const outcome = state.data.outcome;

  if (outcome.kind === "sem-acao") {
    return (
      <>
        <Text style={styles.bodyText}>
          Pode trocar — isso cabe no seu dia, sem mexer nas próximas refeições.
        </Text>
        <ConfirmRow
          label="Trocar"
          onConfirm={() => onConfirm(outcome)}
          onClose={onClose}
        />
      </>
    );
  }

  if (outcome.kind === "recusa-orientada") {
    // "nunca barra": orienta, não bloqueia.
    return (
      <>
        <Text style={styles.orientText}>{outcome.mensagem}</Text>
        <Pressable style={styles.primaryBtn} onPress={onClose}>
          <Text style={styles.primaryText}>Entendi</Text>
        </Pressable>
      </>
    );
  }

  // rebalanceado
  return (
    <>
      <Text style={styles.bodyText}>Esse {mealName} deixa o resto assim:</Text>
      <ScrollView style={styles.list}>
        {outcome.refeicoesAfetadas.map((r) => (
          <View key={r.mealId} style={styles.affectedMeal}>
            <Text style={styles.affectedName}>{r.name}</Text>
            {r.itensAjustados.map((it) => (
              <View key={it.itemId} style={styles.affectedRow}>
                <Text style={styles.affectedFood}>{it.food.name}</Text>
                <Text style={styles.affectedQty}>
                  {it.medidaCaseira
                    ? `${it.medidaCaseira.label} (${formatGrams(it.gramasNovo)})`
                    : formatGrams(it.gramasNovo)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      <ConfirmRow
        label="Confirmar"
        onConfirm={() => onConfirm(outcome)}
        onClose={onClose}
      />
    </>
  );
}

function ConfirmRow({
  label,
  onConfirm,
  onClose,
}: {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  return (
    <View style={styles.confirmRow}>
      <Pressable style={styles.secondaryBtn} onPress={onClose}>
        <Text style={styles.secondaryText}>Cancelar</Text>
      </Pressable>
      <Pressable style={styles.primaryBtn} onPress={onConfirm}>
        <Text style={styles.primaryText}>{label}</Text>
      </Pressable>
    </View>
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
    maxHeight: "80%",
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
  bodyText: { fontSize: 15, color: "#333", marginTop: 12 },
  orientText: {
    fontSize: 15,
    color: "#33691e",
    marginTop: 12,
    lineHeight: 21,
  },
  list: { marginTop: 12, marginBottom: 8 },
  affectedMeal: { marginBottom: 12 },
  affectedName: {
    fontSize: 13,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  affectedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  affectedFood: { fontSize: 15, color: "#1a1a1a", flexShrink: 1 },
  affectedQty: { fontSize: 15, color: "#2e7d32", fontWeight: "600" },
  centerBox: { paddingVertical: 32, alignItems: "center", gap: 8 },
  hint: { fontSize: 14, color: "#666", textAlign: "center" },
  errorText: { fontSize: 14, color: "#c62828", textAlign: "center" },
  confirmRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
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
