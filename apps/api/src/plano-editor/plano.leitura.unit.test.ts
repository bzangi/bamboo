import { describe, expect, it } from 'vitest';
import { montarPlano } from './plano.leitura';

// A montagem do grafo é pura, então tem teste sem banco. O que ela precisa provar
// é que cada linha vai para o pai CERTO — o resto (ordenação, join) é SQL e está
// coberto pelo e2e.

const plan = {
  id: 'p1',
  patientId: 'pac1',
  name: 'Plano de julho',
  isActive: true,
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
};

describe('montarPlano', () => {
  it('aninha item → opção → refeição → tipo-de-dia pelas chaves de pai', () => {
    const dto = montarPlano({
      plan,
      dayTypes: [
        { id: 'dt1', name: 'Treino' },
        { id: 'dt2', name: 'Descanso' },
      ],
      week: [
        { weekday: 0, dayTypeId: 'dt2' },
        { weekday: 1, dayTypeId: 'dt1' },
      ],
      meals: [
        {
          id: 'm1',
          dayTypeId: 'dt1',
          name: 'Café',
          position: 1,
          horario: '08:00:00',
        },
        {
          id: 'm2',
          dayTypeId: 'dt1',
          name: 'Almoço',
          position: 2,
          horario: null,
        },
        {
          id: 'm3',
          dayTypeId: 'dt2',
          name: 'Café',
          position: 1,
          horario: null,
        },
      ],
      options: [
        { id: 'o1', mealId: 'm1', label: 'Padrão', isDefault: true },
        { id: 'o2', mealId: 'm2', label: 'Arroz', isDefault: true },
        { id: 'o3', mealId: 'm2', label: 'Batata', isDefault: false },
      ],
      items: [
        {
          id: 'i1',
          mealOptionId: 'o2',
          foodId: 'f1',
          foodName: 'Arroz, integral, cozido',
          quantityGrams: 120,
          isLocked: false,
          substitutionGroupId: 'g1',
          substitutionGroupName: 'Amidos e cereais',
        },
        {
          id: 'i2',
          mealOptionId: 'o2',
          foodId: 'f2',
          foodName: 'Frango, peito, grelhado',
          quantityGrams: 150,
          isLocked: true,
          substitutionGroupId: null,
          substitutionGroupName: null,
        },
      ],
    });

    expect(dto.dayTypes.map((d) => d.id)).toEqual(['dt1', 'dt2']);
    expect(dto.dayTypes[0].meals.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(dto.dayTypes[1].meals.map((m) => m.id)).toEqual(['m3']);

    const almoco = dto.dayTypes[0].meals[1];
    expect(almoco.options.map((o) => o.id)).toEqual(['o2', 'o3']);
    expect(almoco.options[0].items.map((i) => i.id)).toEqual(['i1', 'i2']);
    // A opção sem item não vira `undefined`, vira lista vazia.
    expect(almoco.options[1].items).toEqual([]);

    expect(almoco.options[0].items[1]).toMatchObject({
      isLocked: true,
      substitutionGroupId: null,
      substitutionGroupName: null,
    });

    expect(dto.week).toEqual([
      { weekday: 0, dayTypeId: 'dt2' },
      { weekday: 1, dayTypeId: 'dt1' },
    ]);
  });

  it('plano vazio: tipos e semana vazios, nunca undefined', () => {
    const dto = montarPlano({
      plan,
      dayTypes: [],
      week: [],
      meals: [],
      options: [],
      items: [],
    });
    expect(dto.dayTypes).toEqual([]);
    expect(dto.week).toEqual([]);
    expect(dto.createdAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('tipo-de-dia sem refeição e refeição sem opção ficam com listas vazias', () => {
    const dto = montarPlano({
      plan,
      dayTypes: [{ id: 'dt1', name: 'Treino' }],
      week: [],
      meals: [
        {
          id: 'm1',
          dayTypeId: 'dt1',
          name: 'Café',
          position: 1,
          horario: null,
        },
      ],
      options: [],
      items: [],
    });
    expect(dto.dayTypes[0].meals[0].options).toEqual([]);
  });

  it('ignora linha órfã em vez de anexá-la no pai errado', () => {
    // Não deveria acontecer (as queries filtram por pai), mas se acontecer o
    // sintoma correto é a linha desaparecer, não contaminar outro nó.
    const dto = montarPlano({
      plan,
      dayTypes: [{ id: 'dt1', name: 'Treino' }],
      week: [],
      meals: [
        {
          id: 'm1',
          dayTypeId: 'FANTASMA',
          name: 'X',
          position: 1,
          horario: null,
        },
      ],
      options: [],
      items: [],
    });
    expect(dto.dayTypes[0].meals).toEqual([]);
  });
});
