import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

// Log de acesso: uma linha por request com método, rota, status final e duração.
// Loga no evento `finish` da resposta (status já definitivo, inclusive o que o
// AllExceptionsFilter setou). Complementa o filtro: aqui o "o quê/quando/quanto
// tempo/status", lá o "porquê" (mensagem/stack). LGPD: só metadados, nunca body.
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const code = res.statusCode;
      const line = `${method} ${originalUrl} → ${code} (${Date.now() - start}ms)`;
      if (code >= 500) this.logger.error(line);
      else if (code >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    return next.handle();
  }
}
