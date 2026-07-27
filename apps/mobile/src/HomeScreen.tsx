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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, shadow, space, text, usePalette, type Palette } from "./theme";
import { getToday, postRegistro } from "@bamboo/api-client";
import type {
  CombinePartDto,
  DayTypeDto,
  MealDto,
  MealItemDto,
  MealOptionDto,
  NutritionDto,
  RebalanceOutcomeDto,
  RegistrationStatus,
  RegistroConsumo,
  RegistroIntent,
  SubstitutionAlternativeDto,
  TodayResponse,
} from "@bamboo/types";
import { API_URL, PATIENT_ID } from "./config";
import {
  A_VONTADE,
  dataExtenso,
  formatQuantidade,
  formatQuantidadeItem,
  formatNutritionLine,
} from "./format";
import { ALTURA_BARRA, BarraMarca } from "./Marca";
import { SubstitutionSheet } from "./SubstitutionSheet";
import { RebalancePreviewSheet } from "./RebalancePreviewSheet";
import { CombineSheet } from "./CombineSheet";
import { MealEditScreen, type Pendentes } from "./MealEditScreen";
import { UndoSwapToast } from "./UndoSwapToast";
import {
  activeOptionId as getActiveOptionId,
  applySwap,
  flattenAdjustments,
  flattenGramas,
  undoSwap,
  type SwapState,
} from "./swaps";
import {
  applyEdit,
  capturarPrevious,
  flattenEditAdjustments,
  flattenEditGramas,
  restaurarConsumo,
  restaurarNames,
  undoEdit,
  type EditState,
} from "./edits";
import { ResumoDoDia } from "./ResumoDoDia";
import { somarNutricao } from "./resumo-dia";
import { deveSinalizar } from "./meal-signal";
import { montarConsumo, type ConsumoItem } from "./consumo";
import { log } from "./logger";

type ScreenState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: TodayResponse };

/** Rolagem que tira a pílula do tipo-de-dia da tela (padding do topo + a data +
 *  a própria pílula). Medido no layout, não calculado: um número aqui é mais
 *  honesto que um `onLayout` que existe pra medir algo que não muda. */
const ALTURA_CABECALHO = 100;

// Override que troca o alimento exibido (substituição ou combinação).
interface NameOverride {
  readonly foodName: string;
  readonly quantityLabel: string;
  // Presente só na combinação: uma etiqueta por alimento (nome + quantidade
  // juntos), pra não espremer o nome quando as 2 quantidades são longas.
  readonly parts?: readonly { readonly name: string; readonly qty: string }[];
  // Nutrição do que entrou no lugar, como a API a devolveu junto da
  // alternativa. É o que mantém o sumário do dia verdadeiro depois da troca —
  // sem isso o topo seguiria somando o alimento que saiu. `null` = a exposição
  // não liberou número (aí a faixa inteira já não aparece).
  readonly nutrition?: NutritionDto | null;
}

export function HomeScreen() {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  // Troca de tipo-de-dia (só exibição): recarrega o /today com este dayTypeId.
  const [dayTypeId, setDayTypeId] = useState<string | undefined>(undefined);

  // Estados locais (resetam ao trocar de tipo-de-dia).
  const [nameOverrides, setNameOverrides] = useState<
    Readonly<Record<string, NameOverride>>
  >({});
  // Troca de OPÇÃO por refeição-gatilho: opção ativa + ajustes derivados juntos.
  // Substitui os antigos optionOverrides + qtyOverrides — agora os ajustes do
  // rebalanceamento moram DENTRO da troca, então desfazer é atômico e nenhum
  // ajuste derivado vira "mudança do item" (sem desfazer por-item neles).
  const [swaps, setSwaps] = useState<SwapState>({});
  // (020) Edição em lote por refeição: o "antes" de cada item editado + os
  // ajustes da prévia, para o desfazer atômico. O render e o consumo continuam
  // em nameOverrides/consumoOverrides — fonte única.
  const [edits, setEdits] = useState<EditState>({});
  // Snackbar temporário pós-troca/edição (~5s): atalho de 1 toque pra desfazer
  // o ato inteiro. Objeto novo a cada ato → o timer reinicia (useEffect abaixo).
  const [toast, setToast] = useState<{
    readonly mealId: string;
    readonly label: string;
    readonly kind: "swap" | "edit";
  } | null>(null);
  // US2: consumo efetivo (foodId + gramas) por item trocado/combinado, pro
  // POST registro derivar "troquei". itemId -> 1..2 alimentos consumidos.
  const [consumoOverrides, setConsumoOverrides] = useState<
    Readonly<Record<string, readonly ConsumoItem[]>>
  >({});
  // Rótulos de quantidade derivados do rebalanceamento (itemId -> rótulo),
  // achatados das trocas E das edições ativas. Só display; o desfazer por-item
  // NÃO depende disto (depende de nameOverride = mudança direta no item).
  const qtyOverrides = useMemo(
    () => ({ ...flattenAdjustments(swaps), ...flattenEditAdjustments(edits) }),
    [swaps, edits],
  );
  // (009) itemIds ajustados na sessão (troca de opção) → alimenta o seletor do
  // sinal "ajustado". Conjunto = chaves dos rótulos de quantidade derivados.
  const adjustedItemIds = useMemo(
    () => new Set(Object.keys(qtyOverrides)),
    [qtyOverrides],
  );
  // Sumário do dia: as gramas novas dos MESMOS ajustes (o rótulo acima é pra
  // ler; estas são pra somar) e a nutrição do que o paciente pôs no lugar.
  const gramasAjustadas = useMemo(
    () => ({ ...flattenGramas(swaps), ...flattenEditGramas(edits) }),
    [swaps, edits],
  );
  const trocados = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(nameOverrides).map(([id, o]) => [
          id,
          o.nutrition ?? null,
        ]),
      ),
    [nameOverrides],
  );

  // Sheets abertos.
  const [subItem, setSubItem] = useState<MealItemDto | null>(null);
  const [combineItem, setCombineItem] = useState<MealItemDto | null>(null);
  const [choice, setChoice] = useState<{
    readonly meal: MealDto;
    readonly option: MealOptionDto;
  } | null>(null);
  const [pickingDayType, setPickingDayType] = useState(false);
  // Rolou o bastante pra pílula do tipo-de-dia sair de vista? Então a barra do
  // topo passa a mostrá-la.
  const [compacto, setCompacto] = useState(false);
  // (020) Refeição com o modo de edição aberto.
  const [editMeal, setEditMeal] = useState<MealDto | null>(null);
  // US1: refeição em curso de registro (trava os botões e evita toque duplo).
  const [registeringMealId, setRegisteringMealId] = useState<string | null>(
    null,
  );
  // Sinal transitório de falha no registro: "nunca barra" (não bloqueia a tela),
  // mas para de fingir que salvou — mostra um aviso pra tentar de novo.
  const [registroError, setRegistroError] = useState<string | null>(null);

  const load = useCallback((dt?: string) => {
    if (!PATIENT_ID) {
      setState({
        status: "error",
        message:
          "Configure EXPO_PUBLIC_PATIENT_ID (uuid do paciente semeado) para carregar o plano.",
      });
      return;
    }
    // Só mostra o spinner de tela cheia no carregamento inicial — um reload
    // (pós-registro) troca `data` no lugar, sem desmontar o ScrollView e
    // resetar a rolagem pro topo.
    setState((prev) =>
      prev.status === "ready" ? prev : { status: "loading" },
    );
    getToday(API_URL, PATIENT_ID, dt)
      .then((data) => setState({ status: "ready", data }))
      .catch((e: unknown) => {
        log.error("HomeScreen", "falha ao carregar /today", e);
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

  // Auto-dismiss do snackbar em ~5s. Novo ato cria um objeto novo → o effect
  // re-roda, limpa o timer anterior e reinicia a janela; unmount limpa o timer.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Auto-dismiss do aviso de falha no registro (~6s).
  useEffect(() => {
    if (!registroError) return;
    const timer = setTimeout(() => setRegistroError(null), 6000);
    return () => clearTimeout(timer);
  }, [registroError]);

  const resetOverrides = useCallback(() => {
    setNameOverrides({});
    setSwaps({});
    setEdits({});
    setEditMeal(null);
    setConsumoOverrides({});
    setToast(null);
  }, []);

  // US2 — aplica a substituição (estado local).
  const handleSubstitute = useCallback(
    (item: MealItemDto, alt: SubstitutionAlternativeDto) => {
      setNameOverrides((prev) => ({
        ...prev,
        [item.id]: {
          foodName: alt.name,
          quantityLabel: formatQuantidade(alt.gramas, alt.medidaCaseira),
          nutrition: alt.nutrition ?? null,
        },
      }));
      // Consumo efetivo: 1 alimento substituto, pra derivar "troquei" no POST.
      setConsumoOverrides((prev) => ({
        ...prev,
        [item.id]: [
          { itemId: item.id, foodId: alt.foodId, quantityGrams: alt.gramas },
        ],
      }));
      setSubItem(null);
    },
    [],
  );

  // US3 — combinação: troca o item por "A + B".
  const handleCombine = useCallback(
    (item: MealItemDto, partes: readonly CombinePartDto[]) => {
      const label = (p: CombinePartDto): string =>
        formatQuantidade(p.gramas, p.medidaCaseira);
      const [p0, p1] = partes;
      if (p0 && p1) {
        setNameOverrides((prev) => ({
          ...prev,
          [item.id]: {
            foodName: `${p0.food.name} + ${p1.food.name}`,
            quantityLabel: `${label(p0)} + ${label(p1)}`,
            parts: [
              { name: p0.food.name, qty: label(p0) },
              { name: p1.food.name, qty: label(p1) },
            ],
            // O item continua sendo UM aporte no dia: as duas metades somam.
            nutrition: somarNutricao([p0.nutrition, p1.nutrition]) ?? null,
          },
        }));
        // Consumo efetivo: 2 alimentos do mesmo grupo, ambos no mesmo itemId;
        // o servidor resolve o grupo por itemId e valida cada food.
        setConsumoOverrides((prev) => ({
          ...prev,
          [item.id]: [
            { itemId: item.id, foodId: p0.food.id, quantityGrams: p0.gramas },
            { itemId: item.id, foodId: p1.food.id, quantityGrams: p1.gramas },
          ],
        }));
      }
      setCombineItem(null);
    },
    [],
  );

  // US3 — confirma a troca de opção: ativa a opção + aplica os ajustes das seguintes.
  const handleConfirmRebalance = useCallback(
    (meal: MealDto, option: MealOptionDto, outcome: RebalanceOutcomeDto) => {
      setSwaps((prev) =>
        applySwap(prev, {
          mealId: meal.id,
          chosenOptionId: option.id,
          previousOptionId: meal.defaultOption.id,
          outcome,
          formatLabel: (it) =>
            formatQuantidade(it.gramasNovo, it.medidaCaseira),
        }),
      );
      setToast({
        mealId: meal.id,
        label: `Trocado para ${option.label}`,
        kind: "swap",
      });
      setChoice(null);
    },
    [],
  );

  // Desfaz a troca INTEIRA de uma refeição (opção + ajustes derivados juntos) e
  // fecha o snackbar. Acionado pelo snackbar e pelo chip da opção default.
  const handleUndoSwap = useCallback((mealId: string) => {
    setSwaps((prev) => undoSwap(prev, mealId));
    setToast(null);
  }, []);

  // (020) Prévia confirmada no modo de edição: aplica TODAS as trocas nos
  // overrides (a mesma fonte que o item a item usa) + guarda o "antes" e os
  // ajustes em `edits` — o desfazer repõe tudo num ato.
  const handleConfirmEdit = useCallback(
    (meal: MealDto, pendentes: Pendentes, outcome: RebalanceOutcomeDto) => {
      setEdits((prev) =>
        applyEdit(prev, {
          mealId: meal.id,
          previous: capturarPrevious(
            Object.keys(pendentes),
            nameOverrides,
            consumoOverrides,
          ),
          outcome,
          formatLabel: (it) =>
            formatQuantidade(it.gramasNovo, it.medidaCaseira),
        }),
      );
      setNameOverrides((prev) => {
        const next = { ...prev };
        for (const [itemId, alt] of Object.entries(pendentes)) {
          next[itemId] = {
            foodName: alt.name,
            quantityLabel: alt.adLibitum
              ? A_VONTADE
              : formatQuantidade(alt.gramas, alt.medidaCaseira),
            nutrition: alt.nutrition ?? null,
          };
        }
        return next;
      });
      setConsumoOverrides((prev) => {
        const next = { ...prev };
        for (const [itemId, alt] of Object.entries(pendentes)) {
          // 0 g (à vontade) fica gravado só para o display; o montarConsumo
          // filtra ≤ 0 antes do registro (D7).
          next[itemId] = [
            { itemId, foodId: alt.foodId, quantityGrams: alt.gramas },
          ];
        }
        return next;
      });
      setToast({ mealId: meal.id, label: "Refeição editada", kind: "edit" });
      setEditMeal(null);
    },
    [nameOverrides, consumoOverrides],
  );

  // (020) Desfazer atômico da edição: repõe o "antes" de cada item editado
  // (valor anterior ou nada) e descarta os ajustes derivados, juntos.
  const handleUndoEdit = useCallback(
    (mealId: string) => {
      const edit = edits[mealId];
      if (!edit) return;
      setNameOverrides((prev) => restaurarNames(prev, edit.previous));
      setConsumoOverrides((prev) => restaurarConsumo(prev, edit.previous));
      setEdits((prev) => undoEdit(prev, mealId));
      setToast(null);
    },
    [edits],
  );

  // Desfaz a mudança DIRETA de um item (substituir/combinar) — volta ao
  // planejado, permite re-ajustar. NÃO toca ajustes de rebalanceamento (esses
  // só se desfazem desfazendo a troca inteira, via handleUndoSwap).
  const handleReset = useCallback((itemId: string) => {
    setNameOverrides((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setConsumoOverrides((prev) => {
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

  // US1/US2/US3 — registra "o agora" (feito/pulei), corrige (re-envia o outro
  // intent numa registrada) ou desfaz (intent="desfazer") e recarrega o /today.
  // "nunca barra": o servidor responde 200 mesmo em no-op; em falha de rede só
  // destrava os botões (sem bloquear a UI). Ao desfazer, "o agora" re-ancora na
  // refeição (vem do GET /today).
  // US2 ("troquei"): em "feito", se a refeição tem adequação ativa de sessão
  // (opção != default OU itens substituídos/combinados), envia o consumo pro
  // servidor DERIVAR "troquei" (FR-003). Sem adequação → "feito" puro (US1).
  // pulei/desfazer não carregam consumo.
  const handleRegistrar = useCallback(
    (meal: MealDto, intent: RegistroIntent) => {
      if (!PATIENT_ID || registeringMealId) return;
      const mealId = meal.id;
      setRegisteringMealId(mealId);

      let consumo: RegistroConsumo | undefined;
      if (intent === "feito") {
        const activeOption =
          meal.options.find((o) => o.id === getActiveOptionId(swaps, mealId)) ??
          meal.defaultOption;
        consumo = montarConsumo(
          activeOption,
          consumoOverrides,
          meal.defaultOption.id,
        );
      }

      postRegistro(API_URL, PATIENT_ID, { mealId, intent, dayTypeId, consumo })
        .then(() => {
          setRegistroError(null);
          load(dayTypeId);
        })
        .catch((e: unknown) => {
          // ANTES: catch vazio engolia o erro (nem console, nem tela). Agora
          // loga e avisa — sem bloquear: o paciente pode tentar de novo.
          log.error(
            "HomeScreen",
            `falha ao registrar meal=${mealId} intent=${intent}`,
            e,
          );
          setRegistroError(
            "Não consegui salvar agora. Toque na refeição pra tentar de novo.",
          );
        })
        .finally(() => setRegisteringMealId(null));
    },
    [consumoOverrides, dayTypeId, load, swaps, registeringMealId],
  );

  if (state.status === "loading") {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={c.feito} />
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

  const pilula = (
    <PilulaTipoDia
      label={data.dayType.label}
      trocavel={data.availableDayTypes.length > 1}
      onPress={() => setPickingDayType(true)}
    />
  );

  return (
    <View style={styles.flex}>
      <ScrollView
        // A tela vai de borda a borda: o conteúdo começa abaixo do vidro (que
        // cobre o recorte do topo) e rola atravessando-o.
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + ALTURA_BARRA + space.lg },
        ]}
        // A barra do topo precisa saber quando a pílula do cabeçalho saiu de
        // vista, pra assumir o lugar dela. Só o cruzamento do limiar re-renderiza.
        scrollEventThrottle={64}
        onScroll={(e) =>
          setCompacto(e.nativeEvent.contentOffset.y > ALTURA_CABECALHO)
        }
      >
        {/* Cabeçalho: onde a pessoa está no tempo, e sob qual cardápio.
            FR-002 / SC-006: o tipo-de-dia é anunciado, fica sempre visível e
            troca num toque — agora numa pílula ao lado da data, em vez de uma
            faixa verde ocupando a largura da tela antes do conteúdo. */}
        <View style={styles.header}>
          {/* A marca saiu daqui: virou a barra de vidro fixa no topo (BarraMarca). */}
          <Text style={styles.data}>{dataExtenso(new Date())}</Text>
          {pilula}
        </View>

        {/* O dia em quatro números, logo abaixo da pílula: soma a opção ATIVA
            de cada refeição (a padrão ou a trocada), pula o que foi pulado e
            acompanha troca/combinação/rebalanceamento. Some inteira quando a
            exposição do paciente não libera número. */}
        <ResumoDoDia
          meals={data.meals}
          swaps={swaps}
          trocados={trocados}
          ajustados={gramasAjustadas}
        />

        {/* Falha no registro (não-bloqueante): "nunca barra", mas não finge que
            salvou. Auto-some em ~6s; o paciente toca de novo pra tentar. */}
        {registroError ? (
          <View style={styles.registroErrorBanner}>
            <Text style={styles.registroErrorText}>{registroError}</Text>
          </View>
        ) : null}

        {/* FR (US1): dia concluído = todas as refeições registradas. Sem "o
            agora"; estado de encerramento, "nunca barra". */}
        {data.diaConcluido ? (
          <View style={styles.doneBanner}>
            <Text style={styles.doneBannerMark}>◠‿◠</Text>
            <Text style={styles.doneBannerText}>Dia concluído</Text>
            <Text style={styles.doneBannerNote}>
              Nada mais a marcar hoje. Até amanhã.
            </Text>
          </View>
        ) : null}

        {orderedMeals.map((meal, i) => (
          <MealCard
            key={meal.id}
            meal={meal}
            isCurrent={meal.id === data.currentMealId}
            isLast={i === orderedMeals.length - 1}
            registering={registeringMealId === meal.id}
            onRegistrar={handleRegistrar}
            activeOptionId={getActiveOptionId(swaps, meal.id)}
            overrideActive={dayTypeId !== undefined}
            sinalAjustado={deveSinalizar(meal, adjustedItemIds)}
            nameOverrides={nameOverrides}
            qtyOverrides={qtyOverrides}
            onChooseOption={(option) => setChoice({ meal, option })}
            onSubstitute={setSubItem}
            onCombine={setCombineItem}
            onReset={handleReset}
            onUndoSwap={handleUndoSwap}
            onEdit={setEditMeal}
          />
        ))}
      </ScrollView>

      {/* Depois do ScrollView de propósito: fica em cima, e o conteúdo desliza
          por baixo do vidro. Rolando, a barra recebe a pílula do tipo-de-dia —
          trocar o dia deixa de exigir voltar ao topo. */}
      <BarraMarca compacto={compacto}>{pilula}</BarraMarca>

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
        meals={data.meals}
        dayTypeId={dayTypeId}
        onClose={() => setChoice(null)}
        onConfirm={(option, outcome) => {
          if (choice) handleConfirmRebalance(choice.meal, option, outcome);
        }}
      />
      <MealEditScreen
        meal={editMeal}
        activeOption={
          editMeal
            ? (editMeal.options.find(
                (o) => o.id === getActiveOptionId(swaps, editMeal.id),
              ) ?? editMeal.defaultOption)
            : null
        }
        meals={data.meals}
        dayTypeId={dayTypeId}
        nameOverrides={nameOverrides}
        consumoOverrides={consumoOverrides}
        onClose={() => setEditMeal(null)}
        onConfirm={handleConfirmEdit}
      />
      <DayTypePicker
        visible={pickingDayType}
        current={data.dayType.id}
        options={data.availableDayTypes}
        onPick={handleSwitchDayType}
        onClose={() => setPickingDayType(false)}
      />
      <UndoSwapToast
        visible={toast !== null}
        label={toast?.label ?? ""}
        onUndo={() => {
          if (!toast) return;
          if (toast.kind === "swap") handleUndoSwap(toast.mealId);
          else handleUndoEdit(toast.mealId);
        }}
      />
    </View>
  );
}

/** O tipo-de-dia anunciado e trocável num toque (FR-002 / SC-006). Um
 *  componente, dois lugares: o cabeçalho e — ao rolar — a barra de vidro. Duas
 *  cópias do mesmo JSX viraria duas pílulas divergindo. */
function PilulaTipoDia({
  label,
  trocavel,
  onPress,
}: {
  readonly label: string;
  readonly trocavel: boolean;
  readonly onPress: () => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      style={styles.dayTypePill}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Trocar o tipo de dia"
    >
      <View style={styles.dayTypeDot} />
      <Text style={styles.dayTypeLabel}>{label}</Text>
      {trocavel ? <Text style={styles.dayTypeSwitch}>trocar</Text> : null}
    </Pressable>
  );
}

// US1: rótulo do estado vigente exibido no badge (em vez das ações).
const REGISTRO_LABEL: Readonly<Record<RegistrationStatus, string>> = {
  feito: "✓ Feito",
  troquei: "⇄ Troquei",
  pulei: "✕ Pulei",
};

function MealCard({
  meal,
  isCurrent,
  isLast,
  registering,
  onRegistrar,
  activeOptionId,
  overrideActive,
  sinalAjustado,
  nameOverrides,
  qtyOverrides,
  onChooseOption,
  onSubstitute,
  onCombine,
  onReset,
  onUndoSwap,
  onEdit,
}: {
  readonly meal: MealDto;
  readonly isCurrent: boolean;
  /** Última refeição do dia: o colmo é cortado no nó dela, em vez de escorrer. */
  readonly isLast: boolean;
  readonly registering: boolean;
  readonly onRegistrar: (meal: MealDto, intent: RegistroIntent) => void;
  readonly activeOptionId: string | undefined;
  // (009) override de tipo-de-dia ativo → badge de registro é display-only (D3).
  readonly overrideActive: boolean;
  // (009) exibir o sinal "ajustado" nesta refeição (seletor deveSinalizar).
  readonly sinalAjustado: boolean;
  readonly nameOverrides: Readonly<Record<string, NameOverride>>;
  readonly qtyOverrides: Readonly<Record<string, string>>;
  readonly onChooseOption: (option: MealOptionDto) => void;
  readonly onSubstitute: (item: MealItemDto) => void;
  readonly onCombine: (item: MealItemDto) => void;
  readonly onReset: (itemId: string) => void;
  readonly onUndoSwap: (mealId: string) => void;
  // (020) Abre o modo de edição em lote da refeição.
  readonly onEdit: (meal: MealDto) => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const activeOption =
    meal.options.find((o) => o.id === activeOptionId) ?? meal.defaultOption;

  // O nó do colmo diz o estado da refeição sem uma palavra: cheio = registrada
  // (na cor do estado), anel = "o agora", ponto de areia = ainda por vir.
  const estado = meal.registro?.state;
  const corDoNo =
    estado === "feito"
      ? c.feito
      : estado === "troquei"
        ? c.troquei
        : estado === "pulei"
          ? c.ink3
          : c.sand;

  return (
    <View style={styles.mealRow}>
      {/* o colmo */}
      <View style={styles.rail}>
        <View style={[styles.railLine, isLast && styles.railLineEnd]} />
        <View
          style={[
            styles.no,
            { backgroundColor: corDoNo, borderColor: corDoNo },
            !estado && styles.noPendente,
            isCurrent && !estado && styles.noAgora,
          ]}
        />
      </View>

      <View style={[styles.mealCard, isCurrent && styles.mealCardCurrent]}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealName}>{meal.name}</Text>
          {meal.horario ? (
            <Text style={styles.mealTime}>{meal.horario}</Text>
          ) : null}
        </View>

        {/* Refeição registrada → badge do estado (FR-003: "troquei" derivado no
          servidor); senão, se for "o agora", o marcador do momento.
          US3 "nunca barra": a registrada nunca tranca. O badge é tocável →
          DESFAZER (vigente→null, "o agora" re-ancora aqui via /today). Ao lado,
          uma correção discreta pulei↔feito (re-envia o outro intent; última-
          escrita-vence no servidor). "troquei" corrige via ↺ desfazer + refazer
          a troca (overrides de sessão não são reenviados numa correção). */}
        {meal.registro ? (
          <View style={styles.registroRow}>
            <Pressable
              style={[
                styles.registroBadge,
                meal.registro.state === "pulei" && styles.registroBadgePulei,
                meal.registro.state === "troquei" &&
                  styles.registroBadgeTroquei,
              ]}
              // (009/D3) Sob override de tipo-de-dia o badge é DISPLAY-ONLY: o
              // evento vive no mealId do tipo de origem; agir aqui mexeria no
              // mealId errado. Pra alterar o registro, volte ao tipo de origem.
              disabled={registering || overrideActive}
              onPress={
                overrideActive ? undefined : () => onRegistrar(meal, "desfazer")
              }
              accessibilityRole={overrideActive ? "text" : "button"}
              accessibilityHint={
                overrideActive
                  ? "Registrado hoje; para alterar, volte ao tipo-de-dia de origem"
                  : "Toque para desfazer este registro"
              }
            >
              <Text
                style={[
                  styles.registroBadgeText,
                  meal.registro.state === "troquei" &&
                    styles.registroBadgeTroqueiText,
                ]}
              >
                {REGISTRO_LABEL[meal.registro.state]}
              </Text>
            </Pressable>
            {!overrideActive ? (
              <>
                <Pressable
                  disabled={registering}
                  onPress={() => onRegistrar(meal, "desfazer")}
                >
                  <Text style={styles.actionReset}>↺ desfazer</Text>
                </Pressable>
                {meal.registro.state === "pulei" ? (
                  <Pressable
                    disabled={registering}
                    onPress={() => onRegistrar(meal, "feito")}
                  >
                    <Text style={styles.action}>marcar feito ›</Text>
                  </Pressable>
                ) : meal.registro.state === "feito" ? (
                  <Pressable
                    disabled={registering}
                    onPress={() => onRegistrar(meal, "pulei")}
                  >
                    <Text style={styles.action}>marcar pulei ›</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : isCurrent ? (
          <Text style={styles.nowBadge}>O agora</Text>
        ) : null}

        {/* (009) Sinal "ajustado": ação/aviso (frase de porquê, SEM número), só
          nas refeições reconciliadas. A registrada não sinaliza (deveSinalizar
          é false nela). Persistente enquanto o ajuste vigora. */}
        {sinalAjustado ? (
          <View style={styles.sinalAjustadoRow}>
            <Text style={styles.sinalAjustadoText}>
              {meal.rebalanceado
                ? "↻ Ajustei o resto do dia porque você já comeu"
                : "↻ Ajustei pra fechar seu dia"}
            </Text>
          </View>
        ) : null}

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

        {/* (020) Modo de edição em lote: "não vou comer nada disso" sem abrir a
          folha de troca item a item N vezes. Só em refeição não registrada e
          com algo trocável — fora disso não há o que editar. */}
        {!meal.registro && activeOption.items.some((i) => i.substitutable) ? (
          <Pressable
            onPress={() => onEdit(meal)}
            accessibilityRole="button"
            accessibilityHint="Trocar vários itens desta refeição de uma vez"
            hitSlop={4}
          >
            <Text style={styles.editMealAction}>✎ editar refeição</Text>
          </Pressable>
        ) : null}

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
                  onPress={() => {
                    // Com troca ativa, re-tocar a opção default desfaz a troca
                    // inteira; tocar outra opção não-default é re-troca (prévia).
                    if (activeOptionId && o.id === meal.defaultOption.id)
                      onUndoSwap(meal.id);
                    else onChooseOption(o);
                  }}
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

        {/* US1: ações de registro do "o agora" (só feito/pulei; "troquei" é
          derivado no servidor). Some assim que a refeição já tem registro. */}
        {isCurrent && !meal.registro ? (
          <View style={styles.registroActions}>
            <Pressable
              style={[styles.registroBtn, styles.registroBtnFeito]}
              disabled={registering}
              onPress={() => onRegistrar(meal, "feito")}
            >
              <Text style={styles.registroBtnFeitoText}>Feito</Text>
            </Pressable>
            <Pressable
              style={[styles.registroBtn, styles.registroBtnPulei]}
              disabled={registering}
              onPress={() => onRegistrar(meal, "pulei")}
            >
              <Text style={styles.registroBtnPuleiText}>Pulei</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
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
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const foodName = nameOverride ? nameOverride.foodName : item.food.name;
  // 018: item à vontade não tem quantidade prescrita — mostrar "0 g" seria a
  // tela mentindo. Vale também para o item trocado (salada por salada mantém o
  // "à vontade", porque a alternativa vem marcada da API).
  const quantityText = item.adLibitum
    ? formatQuantidadeItem(item)
    : nameOverride
      ? nameOverride.quantityLabel
      : (qtyOverride ?? formatQuantidadeItem(item));
  // Mostra nutrição só no estado original (mudou de alimento/quantidade → some).
  const nutritionLine =
    nameOverride || qtyOverride ? null : formatNutritionLine(item);

  return (
    <View style={styles.itemRow}>
      {nameOverride?.parts ? (
        // Combinação: uma etiqueta por alimento — nome + quantidade contidos
        // no mesmo bloco, pra nunca espremer o nome quando a quantidade é longa.
        <View style={styles.tagList}>
          {nameOverride.parts.map((p, i) => (
            <View key={p.name + i}>
              {i > 0 ? <Text style={styles.tagPlus}>+</Text> : null}
              <View style={styles.tag}>
                <Text style={styles.tagName}>{p.name}</Text>
                <Text style={styles.tagQty}>{p.qty}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.itemBody}>
          <View style={styles.itemTextCol}>
            <Text style={styles.itemName}>{foodName}</Text>
            {nutritionLine ? (
              <Text style={styles.itemNutrition}>{nutritionLine}</Text>
            ) : null}
          </View>
          <Text style={styles.itemQty}>{quantityText}</Text>
        </View>
      )}

      {/* "deixa trocar num toque" — sempre disponível em item flexível: dá pra
          trocar/combinar de novo. O "↺ desfazer" por-item aparece SÓ quando o
          item foi mudado DIRETAMENTE (substituir/combinar = nameOverride);
          ajuste vindo do rebalanceamento (qtyOverride) NÃO se desfaz item a
          item — só desfazendo a troca inteira (chip da opção / snackbar). */}
      {item.substitutable ? (
        <View style={styles.itemActions}>
          <Pressable onPress={() => onSubstitute(item)}>
            <Text style={styles.action}>Trocar ›</Text>
          </Pressable>
          <Pressable onPress={() => onCombine(item)}>
            <Text style={styles.action}>Combinar 2 ›</Text>
          </Pressable>
          {nameOverride ? (
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
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
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

// Geometria do colmo. A haste fica em `RAIL_W/2`, e o nó é centrado nela; o
// deslocamento vertical alinha o nó com a linha de base do nome da refeição.
const RAIL_W = 26;
const NO = 9;
const NO_TOP = 22;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.paper },
    scroll: {
      paddingHorizontal: space.lg,
      // paddingTop vem do call site: depende do recorte do aparelho.
      paddingBottom: space.xxl + space.lg,
    },
    centerScreen: {
      flex: 1,
      backgroundColor: c.paper,
      alignItems: "center",
      justifyContent: "center",
      padding: space.xl,
      gap: space.md,
    },
    hint: { ...text.small, color: c.ink2, textAlign: "center" },
    errorText: { ...text.body, color: c.pulei, textAlign: "center" },
    retryButton: {
      marginTop: space.sm,
      paddingVertical: space.md,
      paddingHorizontal: space.xl,
      backgroundColor: c.feito,
      borderRadius: radius.pill,
    },
    retryText: { ...text.value, color: c.onColor },

    // ── cabeçalho ──────────────────────────────────────────────────────────
    header: { marginBottom: space.xl },
    data: {
      fontSize: 28,
      fontWeight: "300",
      letterSpacing: -0.6,
      color: c.ink,
      marginBottom: space.md,
    },
    dayTypePill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingVertical: 7,
      paddingLeft: space.md,
      paddingRight: space.md,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      ...shadow.card,
    },
    dayTypeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.feito,
    },
    dayTypeLabel: { ...text.small, fontWeight: "600", color: c.ink },
    dayTypeSwitch: {
      ...text.small,
      color: c.troquei,
      fontWeight: "600",
      marginLeft: space.xs,
    },

    // ── o colmo ────────────────────────────────────────────────────────────
    mealRow: { flexDirection: "row", marginBottom: space.md },
    rail: { width: RAIL_W },
    railLine: {
      position: "absolute",
      left: RAIL_W / 2,
      top: 0,
      // Atravessa o vão entre cartões, senão a haste vira tracejado.
      bottom: -space.md,
      width: 1,
      backgroundColor: c.line,
    },
    // Última refeição: a haste é cortada no nó, como um colmo colhido.
    railLineEnd: { bottom: undefined, height: NO_TOP + NO / 2 },
    no: {
      position: "absolute",
      left: (RAIL_W - NO) / 2,
      top: NO_TOP,
      width: NO,
      height: NO,
      borderRadius: NO / 2,
      borderWidth: 2,
    },
    // Ainda por vir: anel de areia vazado, não um ponto cheio — o dia não
    // aconteceu, e cheio pareceria feito.
    noPendente: { backgroundColor: c.paper },
    // "O agora": o mesmo anel, maior e na cor do produto. É o único ponto da
    // haste que puxa o olho.
    noAgora: {
      left: (RAIL_W - NO - 4) / 2,
      top: NO_TOP - 2,
      width: NO + 4,
      height: NO + 4,
      borderRadius: (NO + 4) / 2,
      borderColor: c.feito,
      backgroundColor: c.paper,
      borderWidth: 2.5,
    },

    // ── cartão da refeição ─────────────────────────────────────────────────
    mealCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      padding: space.lg,
      ...shadow.card,
    },
    mealCardCurrent: { borderColor: c.feito },
    mealHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    mealName: { ...text.title, color: c.ink },
    mealTime: { ...text.small, color: c.ink3 },
    nowBadge: {
      alignSelf: "flex-start",
      marginTop: space.xs,
      marginBottom: space.sm,
      ...text.label,
      color: c.feito,
    },
    // (009) Sinal "ajustado": discreto, informativo, sem número. Tom de "ação".
    sinalAjustadoRow: {
      alignSelf: "flex-start",
      backgroundColor: c.muted,
      borderRadius: radius.sm,
      borderLeftWidth: 2,
      borderLeftColor: c.pulei,
      paddingVertical: 6,
      paddingHorizontal: space.md,
      marginTop: space.xs,
      marginBottom: space.sm,
    },
    sinalAjustadoText: { ...text.small, color: c.pulei, fontWeight: "600" },
    doneBanner: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: space.xl,
      paddingHorizontal: space.lg,
      marginBottom: space.lg,
      alignItems: "center",
      gap: space.xs,
      ...shadow.card,
    },
    // A cara do panda, em dois traços. O produto se chama Bamboo; aqui é o
    // único lugar em que ele aparece, e só quando o dia fechou.
    doneBannerMark: { fontSize: 22, color: c.feito, letterSpacing: 2 },
    doneBannerText: { ...text.title, color: c.ink },
    doneBannerNote: { ...text.small, color: c.ink2 },
    registroErrorBanner: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.pulei,
      borderLeftWidth: 3,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      marginBottom: space.md,
    },
    registroErrorText: { ...text.small, color: c.pulei },
    registroRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: space.md,
      marginTop: space.sm,
      marginBottom: space.sm,
    },
    registroBadge: {
      paddingVertical: 3,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.feito,
      backgroundColor: "transparent",
    },
    registroBadgePulei: { borderColor: c.line },
    registroBadgeTroquei: { borderColor: c.troquei },
    registroBadgeText: { ...text.small, fontWeight: "600", color: c.feito },
    registroBadgeTroqueiText: { color: c.troquei },
    registroActions: {
      flexDirection: "row",
      gap: space.md,
      marginTop: space.lg,
    },
    registroBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: radius.pill,
      alignItems: "center",
    },
    registroBtnFeito: { backgroundColor: c.feito },
    registroBtnFeitoText: { ...text.value, color: c.onColor },
    registroBtnPulei: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: c.line,
    },
    registroBtnPuleiText: { ...text.value, color: c.ink2 },
    itemRow: {
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
    },
    itemBody: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    itemTextCol: { flexShrink: 1, paddingRight: space.md },
    itemName: { ...text.body, color: c.ink },
    itemNutrition: { ...text.small, color: c.ink3, marginTop: 3 },
    itemQty: { ...text.value, color: c.ink2 },
    // Combinação (021/opção C): 1 etiqueta contida por alimento.
    tagList: { gap: space.xs },
    tag: {
      backgroundColor: c.muted,
      borderRadius: radius.md,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      gap: 2,
    },
    tagName: { ...text.value, color: c.ink },
    tagQty: { ...text.small, color: c.ink2 },
    tagPlus: {
      textAlign: "center",
      fontSize: 12,
      color: c.sand,
      marginVertical: 2,
    },
    itemActions: { flexDirection: "row", gap: space.lg, marginTop: space.sm },
    action: { ...text.small, color: c.troquei, fontWeight: "600" },
    actionReset: { ...text.small, color: c.ink3, fontWeight: "600" },
    // (020) entrada do modo de edição em lote — mesma família das ações.
    editMealAction: {
      ...text.small,
      color: c.troquei,
      fontWeight: "600",
      marginTop: space.md,
    },
    optionChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm,
      marginTop: space.lg,
    },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: "transparent",
    },
    chipActive: { backgroundColor: c.feito, borderColor: c.feito },
    chipText: { ...text.small, color: c.ink2, fontWeight: "600" },
    chipTextActive: { color: c.onColor },

    // ── folha modal (DayTypePicker) ────────────────────────────────────────
    backdrop: { flex: 1, backgroundColor: c.veil, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: space.xl,
      paddingTop: space.md,
      paddingBottom: space.xxl,
      ...shadow.sheet,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.line,
      marginBottom: space.lg,
    },
    sheetTitle: { ...text.sheetTitle, color: c.ink },
    dtRow: {
      paddingVertical: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    dtRowActive: {},
    dtName: { ...text.body, color: c.ink },
    dtNameActive: { color: c.feito, fontWeight: "700" },
  });
