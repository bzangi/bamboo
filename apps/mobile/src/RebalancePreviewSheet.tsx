// US3 — folha de PRÉVIA do rebalanceamento (gatilho P1). Ao escolher uma opção
// diferente da default, chama POST /rebalance/option-choice e mostra a
// consequência nas refeições seguintes ANTES de confirmar ("avisa, não
// surpreende"). recusa-orientada vira orientação (não erro). Ação, não número.
import { useEffect, useMemo, useState } from "react";
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
import { postOptionChoice } from "@bamboo/api-client";
import type {
  MealDto,
  MealOptionDto,
  OptionChoiceResponse,
  RebalanceOutcomeDto,
} from "@bamboo/types";
import { API_URL, PATIENT_ID } from "./config";
import type { ConsumoItem } from "./consumo";
import { formatDiffQuantidade, formatQuantidade } from "./format";
import { log } from "./logger";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: OptionChoiceResponse };

interface Props {
  // Refeição-gatilho + opção escolhida; null = fechado.
  readonly meal: MealDto | null;
  readonly option: MealOptionDto | null;
  // Cardápio exibido: de onde sai o "antes" de cada item ajustado. É o MESMO
  // baseline do motor (ele reescala as gramas do plano), então não há 2ª fonte
  // de verdade nem campo novo no DTO.
  readonly meals: readonly MealDto[];
  // (014) Override de tipo-de-dia ativo na tela, se houver. Vai no corpo: sem ele
  // o servidor resolvia o dia pelo weekday e o gatilho — que é do cardápio EXIBIDO
  // — caía num 404, deixando a prévia inalcançável sob override (KI-005).
  readonly dayTypeId?: string;
  // (020) Edição em lote: a composição EDITADA da refeição-gatilho, na forma do
  // consumo do registro. Presente ⇒ a prévia avalia a refeição comida ASSIM
  // (overlay `items` do endpoint) e os textos falam de edição, não de opção.
  readonly consumoItems?: readonly ConsumoItem[];
  // (020) Título da folha; default = rótulo da opção (fluxo de troca de opção).
  readonly titulo?: string;
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
  meals,
  dayTypeId,
  consumoItems,
  titulo,
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
      ...(dayTypeId ? { dayTypeId } : {}),
      ...(consumoItems && consumoItems.length > 0
        ? { items: consumoItems }
        : {}),
    })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((e: unknown) => {
        log.error(
          "RebalancePreviewSheet",
          `falha na prévia meal=${meal.id}`,
          e,
        );
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : "Falha ao calcular a prévia.";
          setState({ status: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meal, option, dayTypeId, consumoItems]);

  const visible = meal !== null && option !== null;

  // itemId -> gramas de antes. Varre todas as opções: o id do item é único, então
  // não há como casar errado, e um item que o cardápio não expõe só perde o diff.
  const gramasAntes = useMemo(() => {
    const m = new Map<string, number>();
    for (const meal of meals)
      for (const opt of meal.options)
        for (const it of opt.items) m.set(it.id, it.quantityGrams);
    return m;
  }, [meals]);

  return (
    <Folha
      visible={visible}
      onClose={onClose}
      titulo={titulo ?? option?.label ?? "Trocar opção"}
      maxHeight="80%"
    >
      <Body
        state={state}
        edicao={consumoItems !== undefined}
        mealName={meal?.name ?? ""}
        gramasAntes={gramasAntes}
        onConfirm={(outcome) => {
          if (option) onConfirm(option, outcome);
        }}
        onClose={onClose}
      />
    </Folha>
  );
}

function Body({
  state,
  edicao,
  mealName,
  gramasAntes,
  onConfirm,
  onClose,
}: {
  readonly state: LoadState;
  // (020) Prévia da edição em lote (textos falam da refeição editada).
  readonly edicao: boolean;
  readonly mealName: string;
  readonly gramasAntes: ReadonlyMap<string, number>;
  readonly onConfirm: (outcome: RebalanceOutcomeDto) => void;
  readonly onClose: () => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
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
          {edicao
            ? "Pode comer assim — cabe no seu dia, sem mexer nas próximas refeições."
            : "Pode trocar — isso cabe no seu dia, sem mexer nas próximas refeições."}
        </Text>
        <ConfirmRow
          label={edicao ? "Confirmar" : "Trocar"}
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
      <Text style={styles.bodyText}>
        {edicao
          ? `Comer esse ${mealName} do seu jeito deixa o resto assim:`
          : `Esse ${mealName} deixa o resto assim:`}
      </Text>
      <ScrollView style={styles.list}>
        {outcome.refeicoesAfetadas.map((r) => (
          <View key={r.mealId} style={styles.affectedMeal}>
            <Text style={styles.affectedName}>{r.name}</Text>
            {r.itensAjustados.map((it) => {
              const antes = gramasAntes.get(it.itemId);
              const diff =
                antes === undefined
                  ? null
                  : formatDiffQuantidade(
                      antes,
                      it.gramasNovo,
                      it.medidaCaseira,
                    );
              return (
                <View key={it.itemId} style={styles.affectedRow}>
                  <Text style={styles.affectedFood}>{it.food.name}</Text>
                  <View style={styles.affectedQtyBox}>
                    <Text style={styles.affectedQty}>
                      {formatQuantidade(it.gramasNovo, it.medidaCaseira)}
                    </Text>
                    {diff ? (
                      <Text style={styles.affectedDiff}>{diff}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
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
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bodyText: {
      ...text.value,
      fontWeight: "400",
      color: c.ink2,
      marginTop: space.md,
      lineHeight: 22,
    },
    // A recusa orientada é o momento mais delicado do app: o motor está dizendo
    // "não desse jeito". Fica em tinta, com respiro — não em vermelho.
    orientText: {
      ...text.body,
      color: c.ink,
      marginTop: space.md,
      lineHeight: 24,
    },
    list: { marginTop: space.md, marginBottom: space.sm },
    affectedMeal: { marginBottom: space.md },
    affectedName: { ...text.label, color: c.ink3, marginBottom: space.xs },
    affectedRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    affectedFood: {
      ...text.value,
      fontWeight: "400",
      color: c.ink,
      flexShrink: 1,
    },
    affectedQtyBox: { alignItems: "flex-end", flexShrink: 0 },
    affectedQty: { ...text.value, color: c.feito },
    // Direção e tamanho da mudança + o valor anterior. Neutro de propósito:
    // reduzir não é falha (tese: adaptação, não culpa) — a seta carrega o sentido.
    affectedDiff: { ...text.small, color: c.ink3, marginTop: 2 },
    centerBox: {
      paddingVertical: space.xxl,
      alignItems: "center",
      gap: space.sm,
    },
    hint: { ...text.small, color: c.ink2, textAlign: "center" },
    errorText: { ...text.small, color: c.pulei, textAlign: "center" },
    confirmRow: { flexDirection: "row", gap: space.md, marginTop: space.sm },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.feito,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: "center",
    },
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
