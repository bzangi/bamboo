import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { mapExceptionToLog } from './http-error-mapping';

// Casca (borda externa): captura TODA exceção que sobe dos controllers/services,
// loga de forma consistente e devolve o corpo seguro (ApiErrorModel). É o ganho
// principal — hoje um 500 (bug/DB) sai SEM nenhuma linha no servidor; aqui ele
// vira um `error` com stack. 4xx (erro de domínio esperado) vira `warn` enxuto.
// A decisão (status/nível/stack/corpo) é pura (mapExceptionToLog); aqui só o
// efeito: ler a request e chamar o Logger. LGPD: loga método+URL (a URL já traz
// o id do paciente) e a mensagem — NUNCA o corpo da requisição (tem consumo).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const plan = mapExceptionToLog(exception);

    const rawMsg = plan.clientBody.message;
    const msg = Array.isArray(rawMsg) ? rawMsg.join('; ') : String(rawMsg);
    const line = `${plan.status} ${req.method} ${req.originalUrl} — ${msg}`;

    if (plan.level === 'error') {
      // 5xx / erro inesperado: stack completo p/ achar a causa raiz.
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(line, stack);
    } else {
      this.logger.warn(line);
    }

    res.status(plan.status).json(plan.clientBody);
  }
}
