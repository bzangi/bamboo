import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  booleano,
  horario,
  inteiroEntre,
  numeroNaoNegativo,
  numeroPositivo,
  presente,
  texto,
  umDe,
} from './validar';

// Validação ESTRUTURAL de borda (plan.md/D6): o repo não tem
// class-validator/ValidationPipe e não vai ganhar um por causa de uma string.
// Estes helpers são a única lógica nova com ramos suficientes para merecer teste
// isolado — o resto do módulo é coberto por e2e.

describe('presente', () => {
  // O ponto do helper (D7): num PATCH parcial, "não mandou o campo" e "mandou
  // null para limpar" são intenções DIFERENTES, e `body.x === undefined` não as
  // distingue. Só a presença da chave distingue.
  it('distingue chave ausente de chave com null', () => {
    expect(presente({ email: null }, 'email')).toBe(true);
    expect(presente({}, 'email')).toBe(false);
  });

  it('trata undefined explícito como presente (a chave existe)', () => {
    expect(presente({ email: undefined }, 'email')).toBe(true);
  });

  it('não explode com corpo ausente', () => {
    expect(presente(undefined, 'email')).toBe(false);
    expect(presente(null, 'email')).toBe(false);
  });

  it('ignora o que vem do prototype', () => {
    expect(presente({}, 'toString')).toBe(false);
  });
});

describe('texto', () => {
  it('aceita e apara as pontas', () => {
    expect(texto('  Ana Ribeiro  ', 'name')).toBe('Ana Ribeiro');
  });

  it('recusa vazio, só-espaços, não-string e acima do limite', () => {
    for (const v of ['', '   ', 42, null, undefined, {}]) {
      expect(() => texto(v, 'name')).toThrow(BadRequestException);
    }
    expect(() => texto('x'.repeat(121), 'name')).toThrow(BadRequestException);
  });

  it('nomeia o campo na mensagem', () => {
    expect(() => texto('', 'label')).toThrow(/label/);
  });
});

describe('numeroPositivo', () => {
  it('aceita positivo dentro do teto', () => {
    expect(numeroPositivo(150.5, 'quantityGrams')).toBe(150.5);
  });

  it('recusa zero, negativo, não-número, NaN, Infinity e acima do teto', () => {
    for (const v of [0, -1, '150', null, NaN, Infinity]) {
      expect(() => numeroPositivo(v, 'quantityGrams')).toThrow(
        BadRequestException,
      );
    }
    expect(() => numeroPositivo(1e9, 'quantityGrams', 1000)).toThrow(
      BadRequestException,
    );
  });
});

describe('numeroNaoNegativo', () => {
  // Zero é legítimo aqui e não em `numeroPositivo`: água tem 0 kcal, e um
  // alimento com 0 g de gordura é a maioria da tabela.
  it('aceita zero', () => {
    expect(numeroNaoNegativo(0, 'fatPer100g')).toBe(0);
  });

  it('recusa negativo e não-número', () => {
    expect(() => numeroNaoNegativo(-0.1, 'fatPer100g')).toThrow(
      BadRequestException,
    );
    expect(() => numeroNaoNegativo('0', 'fatPer100g')).toThrow(
      BadRequestException,
    );
  });
});

describe('inteiroEntre', () => {
  it('aceita nas duas pontas do intervalo', () => {
    expect(inteiroEntre(0, 'weekday', 0, 6)).toBe(0);
    expect(inteiroEntre(6, 'weekday', 0, 6)).toBe(6);
  });

  it('recusa fora do intervalo, fracionário e não-número', () => {
    for (const v of [-1, 7, 1.5, '3', null]) {
      expect(() => inteiroEntre(v, 'weekday', 0, 6)).toThrow(
        BadRequestException,
      );
    }
  });
});

describe('umDe', () => {
  const NIVEIS = ['hidden', 'percent', 'macros', 'full_kcal'] as const;

  it('aceita valor do conjunto', () => {
    expect(umDe('macros', 'exposure', NIVEIS)).toBe('macros');
  });

  it('recusa fora do conjunto e lista os valores válidos', () => {
    expect(() => umDe('tudo', 'exposure', NIVEIS)).toThrow(BadRequestException);
    expect(() => umDe('tudo', 'exposure', NIVEIS)).toThrow(/full_kcal/);
  });
});

describe('booleano', () => {
  it('aceita só boolean de verdade', () => {
    expect(booleano(true, 'isLocked')).toBe(true);
    expect(booleano(false, 'isLocked')).toBe(false);
    for (const v of ['true', 1, 0, null]) {
      expect(() => booleano(v, 'isLocked')).toThrow(BadRequestException);
    }
  });
});

describe('horario', () => {
  it('normaliza HH:MM para HH:MM:SS', () => {
    expect(horario('08:00', 'horario')).toBe('08:00:00');
  });

  it('aceita HH:MM:SS como veio', () => {
    expect(horario('12:30:45', 'horario')).toBe('12:30:45');
  });

  it('aceita null (o campo é opcional no schema)', () => {
    expect(horario(null, 'horario')).toBeNull();
  });

  it('recusa hora/minuto fora de faixa e formato solto', () => {
    for (const v of ['24:00', '08:60', '8:00', 'oito', '', 800]) {
      expect(() => horario(v, 'horario')).toThrow(BadRequestException);
    }
  });
});
