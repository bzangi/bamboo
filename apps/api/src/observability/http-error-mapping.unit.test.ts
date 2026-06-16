import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { logLevelsFromEnv, mapExceptionToLog } from './http-error-mapping';

describe('mapExceptionToLog', () => {
  it('404 NotFoundException → warn, sem stack, preserva a mensagem no body', () => {
    const plan = mapExceptionToLog(
      new NotFoundException('paciente não encontrado'),
    );
    expect(plan.status).toBe(404);
    expect(plan.level).toBe('warn');
    expect(plan.logStack).toBe(false);
    expect(plan.clientBody.statusCode).toBe(404);
    expect(plan.clientBody.message).toBe('paciente não encontrado');
  });

  it('422 UnprocessableEntity → warn (erro de domínio esperado, não 5xx)', () => {
    const plan = mapExceptionToLog(
      new UnprocessableEntityException('alimento fora do grupo'),
    );
    expect(plan.status).toBe(422);
    expect(plan.level).toBe('warn');
    expect(plan.logStack).toBe(false);
  });

  it('erro desconhecido (não-HttpException) → 500, error, com stack, SEM vazar a mensagem interna', () => {
    const plan = mapExceptionToLog(new Error('detalhe interno secreto'));
    expect(plan.status).toBe(500);
    expect(plan.level).toBe('error');
    expect(plan.logStack).toBe(true);
    expect(plan.clientBody.message).toBe('Internal server error');
    // o corpo que vai pro cliente nunca pode carregar o detalhe interno.
    expect(JSON.stringify(plan.clientBody)).not.toContain('secreto');
  });

  it('500 HttpException (InternalServerError) → error com stack', () => {
    const plan = mapExceptionToLog(new InternalServerErrorException());
    expect(plan.status).toBe(500);
    expect(plan.level).toBe('error');
    expect(plan.logStack).toBe(true);
  });

  it('preserva message em array do BadRequest (ValidationPipe)', () => {
    const plan = mapExceptionToLog(
      new BadRequestException(['campo X inválido', 'campo Y inválido']),
    );
    expect(plan.status).toBe(400);
    expect(plan.level).toBe('warn');
    expect(plan.clientBody.message).toEqual([
      'campo X inválido',
      'campo Y inválido',
    ]);
  });
});

describe('logLevelsFromEnv', () => {
  it('default (undefined) habilita error/warn/log mas NÃO debug', () => {
    const ls = logLevelsFromEnv(undefined);
    expect(ls).toContain('error');
    expect(ls).toContain('warn');
    expect(ls).toContain('log');
    expect(ls).not.toContain('debug');
    expect(ls).not.toContain('verbose');
  });

  it("'debug' habilita debug e verbose (rastreio completo por etapa)", () => {
    const ls = logLevelsFromEnv('debug');
    expect(ls).toContain('debug');
    expect(ls).toContain('verbose');
    expect(ls).toContain('log');
  });

  it("'error' habilita só error/fatal — sem warn nem log (produção silenciosa)", () => {
    const ls = logLevelsFromEnv('error');
    expect(ls).toContain('error');
    expect(ls).not.toContain('warn');
    expect(ls).not.toContain('log');
  });

  it('valor desconhecido cai no default', () => {
    expect(logLevelsFromEnv('xyz')).toEqual(logLevelsFromEnv(undefined));
  });
});
