// US1 — Home "o agora". Busca /today, anuncia o tipo-de-dia (sempre visível),
// destaca a refeição do momento e lista o dia inteiro na ordem.
// Fase 2 (US3): hospeda o estado LOCAL de
//   - troca de OPÇÃO + prévia do rebalanceamento (gatilho P1),
//   - COMBINAÇÃO 1→2,
//   - troca de TIPO-DE-DIA (só exibição: recarrega o /today com dayTypeId),
//   - e a substituição da Fase 1.
// Nada persiste (v0): tudo é override local.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getToday } from "@bamboo/api-client";
import type {
  CombinePartDto,
  DayTypeDto,
  MealDto,
  MealItemDto,
  MealOptionDto,
  RebalanceOutcomeDto,
  SubstitutionAlternativeDto,
  TodayResponse,
} from "@bamboo/types";
import { API_URL, PATIENT_ID } from "./config";
import {
  formatGrams,
  formatMedidaPlanejada,
  formatNutritionLine,
} from "./format";
import { SubstitutionSheet } from "./SubstitutionSheet";
import { RebalancePreviewSheet } from "./RebalancePreviewSheet";
import { CombineSheet } from "./CombineSheet";

type ScreenState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: TodayResponse };

// Override que troca o alimento exibido (substituição ou combinação).
interface NameOverride {
  readonly foodName: string;
  readonly quantityLabel: string;
}

export function HomeScreen() {
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  // Troca de tipo-de-dia (só exibição): recarrega o /today com este dayTypeId.
  const [dayTypeId, setDayTypeId] = useState<string | undefined>(undefined);

  // Estados locais (resetam ao trocar de tipo-de-dia).
  const [nameOverrides, setNameOverrides] = useState<
    Readonly<Record<string, NameOverride>>
  >({});
  const [qtyOverrides, setQtyOverrides] = useState<
    Readonly<Record<string, string>>
  >({}); // ajustes de quantidade vindos do rebalanceamento
  const [optionOverrides, setOptionOverrides] = useState<
    Readonly<Record<string, string>>
  >({}); // mealId -> optionId ativa

  // Sheets abertos.
  const [subItem, setSubItem] = useState<MealItemDto | null>(null);
  const [combineItem, setCombineItem] = useState<MealItemDto | null>(null);
  const [choice, setChoice] = useState<{
    readonly meal: MealDto;
    readonly option: MealOptionDto;
  } | null>(null);
  const [pickingDayType, setPickingDayType] = useState(false);

  const load = useCallback((dt?: string) => {
    if (!PATIENT_ID) {
      setState({
        status: "error",
        message:
          "Configure EXPO_PUBLIC_PATIENT_ID (uuid do paciente semeado) para carregar o plano.",
      });
      return;
    }
    setState({ status: "loading" });
    getToday(API_URL, PATIENT_ID, dt)
      .then((data) => setState({ status: "ready", data }))
      .catch((e: unknown) => {
        setState({
          status: "error",
          message:
            e instanceof Error
              ? e.message
              : "Falha ao carregar o plano de hoje.",
        });
      });
  }, []);

  useEffect(() => {
    load(dayTypeId);
  }, [load, dayTypeId]);

  const resetOverrides = useCallback(() => {
    setNameOverrides({});
    setQtyOverrides({});
    setOptionOverrides({});
  }, []);

  // US2 — aplica a substituição (estado local).
  const handleSubstitute = useCallback(
    (item: MealItemDto, alt: SubstitutionAlternativeDto) => {
      setNameOverrides((prev) => ({
        ...prev,
        [item.id]: {
          foodName: alt.name,
          quantityLabel: alt.medidaCaseira
            ? `${alt.medidaCaseira.label} (${formatGrams(alt.gramas)})`
            : formatGrams(alt.gramas),
        },
      }));
      setSubItem(null);
    },
    [],
  );

  // US3 — combinação: troca o item por "A + B".
  const handleCombine = useCallback(
    (item: MealItemDto, partes: readonly CombinePartDto[]) => {
      const label = (p: CombinePartDto): string =>
        p.medidaCaseira
          ? `${p.medidaCaseira.label} (${formatGrams(p.gramas)})`
          : formatGrams(p.gramas);
      const [p0, p1] = partes;
      if (p0 && p1) {
        setNameOverrides((prev) => ({
          ...prev,
          [item.id]: {
            foodName: `${p0.food.name} + ${p1.food.name}`,
            quantityLabel: `${label(p0)} + ${label(p1)}`,
          },
        }));
      }
      setCombineItem(null);
    },
    [],
  );

  // US3 — confirma a troca de opção: ativa a opção + aplica os ajustes das seguintes.
  const handleConfirmRebalance = useCallback(
    (meal: MealDto, option: MealOptionDto, outcome: RebalanceOutcomeDto) => {
      setOptionOverrides((prev) => ({ ...prev, [meal.id]: option.id }));
      if (outcome.kind === "rebalanceado") {
        setQtyOverrides((prev) => {
          const next = { ...prev };
          for (const r of outcome.refeicoesAfetadas) {
            for (const it of r.itensAjustados) {
              next[it.itemId] = it.medidaCaseira
                ? `${it.medidaCaseira.label} (${formatGrams(it.gramasNovo)})`
                : formatGrams(it.gramasNovo);
            }
          }
          return next;
        });
      }
      setChoice(null);
    },
    [],
  );

  // Desfaz o override de um item (volta ao planejado) — permite re-ajustar.
  const handleReset = useCallback((itemId: string) => {
    setNameOverrides((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setQtyOverrides((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  const handleSwitchDayType = useCallback(
    (id: string) => {
      setPickingDayType(false);
      setDayTypeId(id);
      resetOverrides();
    },
    [resetOverrides],
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
        <Pressable style={styles.retryButton} onPress={() => load(dayTypeId)}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  const data = state.data;
  const orderedMeals = [...data.meals].sort((a, b) => a.position - b.position);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* FR-002 / SC-006: tipo-de-dia anunciado, sempre visível e trocável num toque. */}
        <Pressable
          style={styles.dayTypeBanner}
          onPress={() => setPickingDayType(true)}
          accessibilityRole="button"
        >
          <Text style={styles.dayTypeLabel}>Hoje: {data.dayType.label}</Text>
          {data.availableDayTypes.length > 1 ? (
            <Text style={styles.dayTypeSwitch}>trocar ›</Text>
          ) : null}
        </Pressable>

        {orderedMeals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isCurrent={meal.id === data.currentMealId}
            activeOptionId={optionOverrides[meal.id]}
            nameOverrides={nameOverrides}
            qtyOverrides={qtyOverrides}
            onChooseOption={(option) => setChoice({ meal, option })}
            onSubstitute={setSubItem}
            onCombine={setCombineItem}
            onReset={handleReset}
          />
        ))}
      </ScrollView>

      <SubstitutionSheet
        item={subItem}
        onClose={() => setSubItem(null)}
        onSelect={handleSubstitute}
      />
      <CombineSheet
        item={combineItem}
        onClose={() => setCombineItem(null)}
        onConfirm={handleCombine}
      />
      <RebalancePreviewSheet
        meal={choice?.meal ?? null}
        option={choice?.option ?? null}
        onClose={() => setChoice(null)}
        onConfirm={(option, outcome) => {
          if (choice) handleConfirmRebalance(choice.meal, option, outcome);
        }}
      />
      <DayTypePicker
        visible={pickingDayType}
        current={data.dayType.id}
        options={data.availableDayTypes}
        onPick={handleSwitchDayType}
        onClose={() => setPickingDayType(false)}
      />
    </View>
  );
}

function MealCard({
  meal,
  isCurrent,
  activeOptionId,
  nameOverrides,
  qtyOverrides,
  onChooseOption,
  onSubstitute,
  onCombine,
  onReset,
}: {
  readonly meal: MealDto;
  readonly isCurrent: boolean;
  readonly activeOptionId: string | undefined;
  readonly nameOverrides: Readonly<Record<string, NameOverride>>;
  readonly qtyOverrides: Readonly<Record<string, string>>;
  readonly onChooseOption: (option: MealOptionDto) => void;
  readonly onSubstitute: (item: MealItemDto) => void;
  readonly onCombine: (item: MealItemDto) => void;
  readonly onReset: (itemId: string) => void;
}) {
  const activeOption =
    meal.options.find((o) => o.id === activeOptionId) ?? meal.defaultOption;

  return (
    <View style={[styles.mealCard, isCurrent && styles.mealCardCurrent]}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealName}>{meal.name}</Text>
        {meal.horario ? (
          <Text style={styles.mealTime}>{meal.horario}</Text>
        ) : null}
      </View>

      {isCurrent ? <Text style={styles.nowBadge}>O agora</Text> : null}

      {activeOption.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          nameOverride={nameOverrides[item.id]}
          qtyOverride={qtyOverrides[item.id]}
          onSubstitute={onSubstitute}
          onCombine={onCombine}
          onReset={onReset}
        />
      ))}

      {/* Fase 2 (P1): chips das opções — tocar uma diferente abre a prévia. */}
      {meal.options.length > 1 ? (
        <View style={styles.optionChips}>
          {meal.options.map((o) => {
            const active = o.id === activeOption.id;
            return (
              <Pressable
                key={o.id}
                style={[styles.chip, active && styles.chipActive]}
                disabled={active}
                onPress={() => onChooseOption(o)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ItemRow({
  item,
  nameOverride,
  qtyOverride,
  onSubstitute,
  onCombine,
  onReset,
}: {
  readonly item: MealItemDto;
  readonly nameOverride: NameOverride | undefined;
  readonly qtyOverride: string | undefined;
  readonly onSubstitute: (item: MealItemDto) => void;
  readonly onCombine: (item: MealItemDto) => void;
  readonly onReset: (itemId: string) => void;
}) {
  const foodName = nameOverride ? nameOverride.foodName : item.food.name;
  const quantityText = nameOverride
    ? nameOverride.quantityLabel
    : (qtyOverride ??
      (item.medidaCaseira
        ? formatMedidaPlanejada(item.quantityGrams, item.medidaCaseira)
        : formatGrams(item.quantityGrams)));
  // Mostra nutrição só no estado original (mudou de alimento/quantidade → some).
  const nutritionLine =
    nameOverride || qtyOverride ? null : formatNutritionLine(item);

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemBody}>
        <View style={styles.itemTextCol}>
          <Text style={styles.itemName}>{foodName}</Text>
          {nutritionLine ? (
            <Text style={styles.itemNutrition}>{nutritionLine}</Text>
          ) : null}
        </View>
        <Text style={styles.itemQty}>{quantityText}</Text>
      </View>

      {/* "deixa trocar num toque" — sempre disponível em item flexível: dá pra
          trocar/combinar de novo. Com override aplicado, oferece desfazer. */}
      {item.substitutable ? (
        <View style={styles.itemActions}>
          <Pressable onPress={() => onSubstitute(item)}>
            <Text style={styles.action}>Trocar ›</Text>
          </Pressable>
          <Pressable onPress={() => onCombine(item)}>
            <Text style={styles.action}>Combinar 2 ›</Text>
          </Pressable>
          {nameOverride || qtyOverride ? (
            <Pressable onPress={() => onReset(item.id)}>
              <Text style={styles.actionReset}>↺ desfazer</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DayTypePicker({
  visible,
  current,
  options,
  onPick,
  onClose,
}: {
  readonly visible: boolean;
  readonly current: string;
  readonly options: readonly DayTypeDto[];
  readonly onPick: (id: string) => void;
  readonly onClose: () => void;
}) {
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
          <Text style={styles.sheetTitle}>Tipo de dia</Text>
          {options.map((o) => {
            const active = o.id === current;
            return (
              <Pressable
                key={o.id}
                style={[styles.dtRow, active && styles.dtRowActive]}
                disabled={active}
                onPress={() => onPick(o.id)}
              >
                <Text style={[styles.dtName, active && styles.dtNameActive]}>
                  {active ? "✓ " : ""}
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayTypeLabel: { color: "#fff", fontSize: 18, fontWeight: "700" },
  dayTypeSwitch: { color: "#c8e6c9", fontSize: 14, fontWeight: "600" },
  mealCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  mealCardCurrent: { borderWidth: 2, borderColor: "#2e7d32" },
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
  itemName: { fontSize: 16, color: "#1a1a1a" },
  itemNutrition: { fontSize: 13, color: "#888", marginTop: 2 },
  itemQty: { fontSize: 15, color: "#333", fontWeight: "600" },
  itemActions: { flexDirection: "row", gap: 16, marginTop: 6 },
  action: { fontSize: 13, color: "#1565c0", fontWeight: "600" },
  actionReset: { fontSize: 13, color: "#999", fontWeight: "600" },
  optionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#eef",
    borderWidth: 1,
    borderColor: "#dde",
  },
  chipActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  chipText: { fontSize: 13, color: "#1565c0", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  // bottom-sheet (DayTypePicker)
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
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d0d0d0",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#1a1a1a" },
  dtRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  dtRowActive: {},
  dtName: { fontSize: 16, color: "#1a1a1a" },
  dtNameActive: { color: "#2e7d32", fontWeight: "700" },
});
