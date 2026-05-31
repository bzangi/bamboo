// US1 — Home "o agora". Busca /today, anuncia o tipo-de-dia (sempre visível),
// destaca a refeição do momento e lista o dia inteiro na ordem.
// Hospeda também o estado LOCAL da troca (US2): selecionar uma alternativa
// reescreve o item exibido, sem persistir (v0).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getToday } from "@bamboo/api-client";
import type {
  MealDto,
  MealItemDto,
  SubstitutionAlternativeDto,
  TodayResponse,
} from "@bamboo/types";
import { API_URL, PATIENT_ID } from "./config";
import { formatGrams, formatNutritionLine } from "./format";
import { SubstitutionSheet } from "./SubstitutionSheet";

type ScreenState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: TodayResponse };

export function HomeScreen() {
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  // Override local por item (foodName + label de quantidade) aplicado na troca.
  const [overrides, setOverrides] = useState<Readonly<Record<string, ItemOverride>>>(
    {},
  );
  // Item aberto no bottom-sheet; null = fechado.
  const [activeItem, setActiveItem] = useState<MealItemDto | null>(null);

  const load = useCallback(() => {
    if (!PATIENT_ID) {
      setState({
        status: "error",
        message:
          "Configure EXPO_PUBLIC_PATIENT_ID (uuid do paciente semeado) para carregar o plano.",
      });
      return;
    }
    setState({ status: "loading" });
    getToday(API_URL, PATIENT_ID)
      .then((data) => setState({ status: "ready", data }))
      .catch((e: unknown) => {
        const message =
          e instanceof Error ? e.message : "Falha ao carregar o plano de hoje.";
        setState({ status: "error", message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = useCallback(
    (item: MealItemDto, alt: SubstitutionAlternativeDto) => {
      setOverrides((prev) => ({
        ...prev,
        [item.id]: {
          foodName: alt.name,
          quantityLabel: alt.medidaCaseira
            ? `${alt.medidaCaseira.label} (${formatGrams(alt.gramas)})`
            : formatGrams(alt.gramas),
        },
      }));
      setActiveItem(null);
    },
    [],
  );

  if (state.status === "loading") {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Carregando seu plano de hoje…</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable style={styles.retryButton} onPress={load}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ReadyView
      data={state.data}
      overrides={overrides}
      onOpenItem={setActiveItem}
      activeItem={activeItem}
      onCloseSheet={() => setActiveItem(null)}
      onSelectAlternative={handleSelect}
    />
  );
}

interface ItemOverride {
  readonly foodName: string;
  readonly quantityLabel: string;
}

function ReadyView({
  data,
  overrides,
  onOpenItem,
  activeItem,
  onCloseSheet,
  onSelectAlternative,
}: {
  readonly data: TodayResponse;
  readonly overrides: Readonly<Record<string, ItemOverride>>;
  readonly onOpenItem: (item: MealItemDto) => void;
  readonly activeItem: MealItemDto | null;
  readonly onCloseSheet: () => void;
  readonly onSelectAlternative: (
    item: MealItemDto,
    alt: SubstitutionAlternativeDto,
  ) => void;
}) {
  // Refeições na ordem definida (FR-003).
  const orderedMeals = useMemo(
    () => [...data.meals].sort((a, b) => a.position - b.position),
    [data.meals],
  );

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* FR-002 / SC-006: tipo-de-dia anunciado e sempre visível. */}
        <View style={styles.dayTypeBanner}>
          <Text style={styles.dayTypeLabel}>Hoje: {data.dayType.label}</Text>
        </View>

        {orderedMeals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isCurrent={meal.id === data.currentMealId}
            overrides={overrides}
            onOpenItem={onOpenItem}
          />
        ))}
      </ScrollView>

      <SubstitutionSheet
        item={activeItem}
        onClose={onCloseSheet}
        onSelect={onSelectAlternative}
      />
    </View>
  );
}

function MealCard({
  meal,
  isCurrent,
  overrides,
  onOpenItem,
}: {
  readonly meal: MealDto;
  readonly isCurrent: boolean;
  readonly overrides: Readonly<Record<string, ItemOverride>>;
  readonly onOpenItem: (item: MealItemDto) => void;
}) {
  return (
    <View style={[styles.mealCard, isCurrent && styles.mealCardCurrent]}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealName}>{meal.name}</Text>
        {/* FR-005a: horário quando definido (metadado informativo). */}
        {meal.horario ? (
          <Text style={styles.mealTime}>{meal.horario}</Text>
        ) : null}
      </View>

      {isCurrent ? <Text style={styles.nowBadge}>O agora</Text> : null}

      {meal.defaultOption.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          override={overrides[item.id]}
          onOpenItem={onOpenItem}
        />
      ))}

      {/* FR-004: sinaliza outras opções sem expandi-las (fora de escopo). */}
      {meal.otherOptionsCount > 0 ? (
        <Text style={styles.otherOptions}>
          {meal.defaultOption.label} · +{meal.otherOptionsCount}{" "}
          {meal.otherOptionsCount === 1 ? "outra opção" : "outras opções"}
        </Text>
      ) : null}
    </View>
  );
}

function ItemRow({
  item,
  override,
  onOpenItem,
}: {
  readonly item: MealItemDto;
  readonly override: ItemOverride | undefined;
  readonly onOpenItem: (item: MealItemDto) => void;
}) {
  const foodName = override ? override.foodName : item.food.name;
  const quantityText = override
    ? override.quantityLabel
    : formatGrams(item.quantityGrams);
  const nutritionLine = override ? null : formatNutritionLine(item);

  const content = (
    <View style={styles.itemBody}>
      <View style={styles.itemTextCol}>
        <Text style={styles.itemName}>{foodName}</Text>
        {nutritionLine ? (
          <Text style={styles.itemNutrition}>{nutritionLine}</Text>
        ) : null}
      </View>
      <View style={styles.itemRightCol}>
        <Text style={styles.itemQty}>{quantityText}</Text>
        {/* "deixa trocar num toque": só sinaliza quando é substituível. */}
        {item.substitutable ? (
          <Text style={styles.swapHint}>Trocar ›</Text>
        ) : null}
      </View>
    </View>
  );

  // FR-012 / SC-004: item não-substituível não tem gatilho de troca (não barra).
  if (!item.substitutable) {
    return <View style={styles.itemRow}>{content}</View>;
  }

  return (
    <Pressable
      style={styles.itemRow}
      onPress={() => onOpenItem(item)}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f5f5f5" },
  scroll: { padding: 16, paddingTop: 56, paddingBottom: 40 },
  centerScreen: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  hint: { fontSize: 14, color: "#666", textAlign: "center" },
  errorText: { fontSize: 15, color: "#c62828", textAlign: "center" },
  retryButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#1565c0",
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  dayTypeBanner: {
    backgroundColor: "#2e7d32",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  dayTypeLabel: { color: "#fff", fontSize: 18, fontWeight: "700" },
  mealCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  mealCardCurrent: {
    borderWidth: 2,
    borderColor: "#2e7d32",
  },
  mealHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  mealName: { fontSize: 17, fontWeight: "700", color: "#1a1a1a" },
  mealTime: { fontSize: 14, color: "#888" },
  nowBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#2e7d32",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },
  itemBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemTextCol: { flexShrink: 1, paddingRight: 12 },
  itemRightCol: { alignItems: "flex-end" },
  itemName: { fontSize: 16, color: "#1a1a1a" },
  itemNutrition: { fontSize: 13, color: "#888", marginTop: 2 },
  itemQty: { fontSize: 15, color: "#333", fontWeight: "600" },
  swapHint: { fontSize: 13, color: "#1565c0", marginTop: 2 },
  otherOptions: {
    fontSize: 13,
    color: "#888",
    marginTop: 10,
    fontStyle: "italic",
  },
});
