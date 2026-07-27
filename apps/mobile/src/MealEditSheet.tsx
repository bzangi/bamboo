// (020) Modo de edição da refeição INTEIRA: troca vários itens de uma vez e vê
// UMA prévia de impacto no submit — "não vou comer nada disso" sem abrir a
// folha de troca N vezes. As trocas ficam PENDENTES aqui dentro (nada é
// aplicado nem persistido); o picker é o SubstitutionSheet de sempre (busca e
// paginação de graça) e a prévia é o RebalancePreviewSheet com a composição
// editada no corpo. Cancelar (ou falhar a rede da prévia) preserva o trabalho.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Folha } from "./Folha";
import { radius, space, text, usePalette, type Palette } from "./theme";
import type {
  MealDto,
  MealItemDto,
  MealOptionDto,
  RebalanceOutcomeDto,
  SubstitutionAlternativeDto,
} from "@bamboo/types";
import type { ConsumoItem } from "./consumo";
import { RebalancePreviewSheet } from "./RebalancePreviewSheet";
import { SubstitutionSheet } from "./SubstitutionSheet";
import {
  A_VONTADE,
  formatAlternativeQuantity,
  formatQuantidadeItem,
} from "./format";

// Igual ao NameOverride do HomeScreen (compatibilidade estrutural).
interface NameOverride {
  readonly foodName: string;
  readonly quantityLabel: string;
}

export type Pendentes = Readonly<Record<string, SubstitutionAlternativeDto>>;

interface Props {
  // Refeição em edição; null = fechado. Só chega aqui refeição NÃO registrada
  // com ao menos um item flexível (o botão nem aparece fora disso).
  readonly meal: MealDto | null;
  // Opção atualmente EXIBIDA (FR-010: a edição parte do que está na tela).
  readonly activeOption: MealOptionDto | null;
  // Cardápio exibido + override de tipo-de-dia: repassados à prévia.
  readonly meals: readonly MealDto[];
  readonly dayTypeId?: string;
  // Composição corrente da sessão (trocas avulsas/combinações já feitas).
  readonly nameOverrides: Readonly<Record<string, NameOverride>>;
  readonly consumoOverrides: Readonly<Record<string, readonly ConsumoItem[]>>;
  readonly onClose: () => void;
  // Prévia confirmada: o pai aplica trocas + ajustes num ato (atômico).
  readonly onConfirm: (
    meal: MealDto,
    pendentes: Pendentes,
    outcome: RebalanceOutcomeDto,
  ) => void;
}

export function MealEditSheet({
  meal,
  activeOption,
  meals,
  dayTypeId,
  nameOverrides,
  consumoOverrides,
  onClose,
  onConfirm,
}: Props) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [pendentes, setPendentes] = useState<Pendentes>({});
  const [pickingItem, setPickingItem] = useState<MealItemDto | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Reset DURANTE o render ao trocar de refeição (padrão do SubstitutionSheet):
  // num useEffect, a prévia poderia disparar com pendências da edição anterior.
  const [mealAnterior, setMealAnterior] = useState(meal);
  if (meal !== mealAnterior) {
    setMealAnterior(meal);
    setPendentes({});
    setPickingItem(null);
    setPreviewOpen(false);
  }

  const temPendencia = Object.keys(pendentes).length > 0;

  // Corpo da prévia: a composição da refeição como será COMIDA — pendências
  // desta edição por cima das trocas avulsas já feitas na sessão (SC-005: o que
  // a prévia avalia é o que o registro grava). Entradas 0 g (à vontade) ficam
  // fora: não contribuem e o endpoint rejeita ≤ 0 (D7).
  const consumoItems = useMemo(() => {
    if (!activeOption) return [];
    return activeOption.items.flatMap((it): readonly ConsumoItem[] => {
      const alt = pendentes[it.id];
      if (alt) {
        return alt.adLibitum
          ? []
          : [{ itemId: it.id, foodId: alt.foodId, quantityGrams: alt.gramas }];
      }
      return (consumoOverrides[it.id] ?? []).filter((e) => e.quantityGrams > 0);
    });
  }, [activeOption, pendentes, consumoOverrides]);

  const submeter = () => {
    if (!meal || !temPendencia) return;
    if (consumoItems.length === 0) {
      // Só trocas à vontade: nada muda nutricionalmente — não há impacto a
      // calcular, confirma direto (a prévia rejeitaria uma lista vazia).
      onConfirm(meal, pendentes, { kind: "sem-acao" });
      return;
    }
    setPreviewOpen(true);
  };

  const visible = meal !== null && activeOption !== null;

  return (
    <>
      <Folha
        visible={visible}
        onClose={onClose}
        titulo="Editar refeição"
        legenda={
          meal
            ? `${meal.name} — troque o que quiser e veja o impacto`
            : undefined
        }
        maxHeight="85%"
      >
        <ScrollView style={styles.list}>
          {activeOption?.items.map((item) => (
            <LinhaEdicao
              key={item.id}
              item={item}
              atual={nameOverrides[item.id]}
              pendente={pendentes[item.id]}
              onPick={() => setPickingItem(item)}
              onDesfazer={() =>
                setPendentes((prev) => {
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                })
              }
            />
          ))}
        </ScrollView>

        <View style={styles.footerRow}>
          <Pressable style={styles.secondaryBtn} onPress={onClose}>
            <Text style={styles.secondaryText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, !temPendencia && styles.primaryBtnOff]}
            disabled={!temPendencia}
            onPress={submeter}
            accessibilityRole="button"
            accessibilityHint="Mostra o impacto das trocas no resto do dia antes de aplicar"
          >
            <Text style={styles.primaryText}>Ver impacto</Text>
          </Pressable>
        </View>
      </Folha>

      {/* Picker aninhado: a folha de troca de sempre; a escolha vira PENDÊNCIA. */}
      <SubstitutionSheet
        item={pickingItem}
        onClose={() => setPickingItem(null)}
        onSelect={(item, alt) => {
          setPendentes((prev) => ({ ...prev, [item.id]: alt }));
          setPickingItem(null);
        }}
      />

      {/* A prévia; fechar/recusar volta para cá com as pendências intactas. */}
      <RebalancePreviewSheet
        meal={previewOpen ? meal : null}
        option={previewOpen ? activeOption : null}
        meals={meals}
        dayTypeId={dayTypeId}
        consumoItems={consumoItems}
        titulo="Impacto no seu dia"
        onClose={() => setPreviewOpen(false)}
        onConfirm={(_option, outcome) => {
          if (meal) onConfirm(meal, pendentes, outcome);
        }}
      />
    </>
  );
}

function LinhaEdicao({
  item,
  atual,
  pendente,
  onPick,
  onDesfazer,
}: {
  readonly item: MealItemDto;
  readonly atual: NameOverride | undefined;
  readonly pendente: SubstitutionAlternativeDto | undefined;
  readonly onPick: () => void;
  readonly onDesfazer: () => void;
}) {
  const c = usePalette();
  const styles = useMemo(() => makeStyles(c), [c]);

  // Composição exibida hoje (troca avulsa da sessão vence o planejado).
  const nomeAtual = atual?.foodName ?? item.food.name;
  const qtdAtual = item.adLibitum
    ? A_VONTADE
    : (atual?.quantityLabel ?? formatQuantidadeItem(item));

  if (!item.substitutable) {
    return (
      <View style={[styles.row, styles.rowLocked]}>
        <View style={styles.rowMain}>
          <Text style={styles.foodLocked}>{nomeAtual}</Text>
          <Text style={styles.qtyLocked}>{qtdAtual}</Text>
        </View>
        <Text style={styles.lockedHint}>fixo no plano</Text>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.row}
      onPress={onPick}
      accessibilityRole="button"
      accessibilityHint="Trocar este alimento"
    >
      <View style={styles.rowMain}>
        <Text style={[styles.food, pendente && styles.foodTrocado]}>
          {nomeAtual}
        </Text>
        <Text style={[styles.qty, pendente && styles.foodTrocado]}>
          {qtdAtual}
        </Text>
      </View>
      {pendente ? (
        <View style={styles.rowMain}>
          <Text style={styles.foodNovo}>→ {pendente.name}</Text>
          <View style={styles.novoBox}>
            <Text style={styles.qtyNovo}>
              {pendente.adLibitum
                ? A_VONTADE
                : formatAlternativeQuantity(pendente)}
            </Text>
            <Pressable onPress={onDesfazer} hitSlop={8}>
              <Text style={styles.desfazer}>↺</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.trocarHint}>trocar ›</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: { marginTop: space.lg, marginBottom: space.sm },
    row: {
      paddingVertical: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    rowLocked: { opacity: 0.6 },
    rowMain: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    food: { ...text.body, color: c.ink, flexShrink: 1, paddingRight: space.md },
    foodTrocado: { textDecorationLine: "line-through", color: c.ink3 },
    foodLocked: { ...text.body, color: c.ink2 },
    qty: { ...text.value, color: c.ink2 },
    qtyLocked: { ...text.value, color: c.ink3 },
    foodNovo: {
      ...text.body,
      color: c.ink,
      fontWeight: "600",
      flexShrink: 1,
      paddingRight: space.md,
      marginTop: space.xs,
    },
    novoBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      marginTop: space.xs,
    },
    qtyNovo: { ...text.value, color: c.feito },
    desfazer: { ...text.body, color: c.troquei, fontWeight: "700" },
    trocarHint: { ...text.small, color: c.troquei, marginTop: space.xs },
    lockedHint: { ...text.small, color: c.ink3, marginTop: space.xs },
    footerRow: { flexDirection: "row", gap: space.md, marginTop: space.sm },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.feito,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: "center",
    },
    primaryBtnOff: { opacity: 0.4 },
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
