import { HttpException, HttpStatus, type LogLevel } from '@nestjs/common';

// Núcleo PURO da observabilidade de erro (sem I/O, sem Logger): decide, a partir
// de uma exceção qualquer, (a) que status HTTP o cliente recebe, (b) em que nível
// logar, (c) se loga o stack e (d) o corpo seguro de resposta. A casca (o filtro
// global) faz só o efeito: lê a request e chama o Logger. Testável sem Nest/DB.

export interface ExceptionLogPlan {
  /** status HTTP devolvido ao cliente. */
  readonly status: number;
  /** 4xx = warn (erro esperado/de domínio); 5xx ou desconhecido = error. */
  readonly level: 'warn' | 'error';
  /** logar o stack completo? só em 5xx/desconhecido (bug, DB, falha real). */
  readonly logStack: boolean;
  /** corpo de resposta no shape ApiErrorModel — nunca vaza detalhe interno. */
  readonly clientBody: {
    readonly statusCode: number;
    readonly message: string | readonly string[];
    readonly error?: string;
  };
}

/**
 * Mapeia QUALQUER exceção para um plano de log + resposta.
 * - HttpException (lançada pela casca, "opção 1"): preserva status e corpo do
 *   Nest; 4xx → warn, 5xx → error.
 * - Qualquer outra coisa (Error nativo, erro do Drizzle, bug): vira 500 e NÃO
 *   vaza a mensagem interna pro cliente (só o log do servidor vê o detalhe).
 */
export function mapExceptionToLog(exception: unknown): ExceptionLogPlan {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const clientBody =
      typeof res === 'string'
        ? { statusCode: status, message: res }
        : (res as ExceptionLogPlan['clientBody']);
    const isServerError = status >= 500;
    return {
      status,
      level: isServerError ? 'error' : 'warn',
      logStack: isServerError,
      clientBody,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    level: 'error',
    logStack: true,
    clientBody: {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    },
  };
}

/**
 * Resolve os níveis de log habilitados a partir de `LOG_LEVEL` (env).
 * Default (não setado): error/warn/log — sem o rastreio por etapa (debug).
 * `debug`/`verbose`: liga o rastreio completo passo-a-passo dos services.
 * `warn`/`error`: progressivamente mais silencioso (produção).
 */
export function logLevelsFromEnv(raw: string | undefined): LogLevel[] {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'verbose':
      return ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
    case 'debug':
      return ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
    case 'error':
      return ['fatal', 'error'];
    case 'warn':
      return ['fatal', 'error', 'warn'];
    default:
      // undefined, 'log', 'info' ou qualquer valor desconhecido.
      return ['fatal', 'error', 'warn', 'log'];
  }
}
