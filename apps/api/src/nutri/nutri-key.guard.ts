// Guard da via da nutri (FR-016/SC-008). Credencial stub do v0: o header
// x-nutri-key precisa bater com a env NUTRI_API_KEY. FAIL-CLOSED: sem a env
// (ou vazia), NEGA tudo — a via nunca abre por engano de configuração.
// O app/api-client do paciente não conhecem a chave → toda chamada vinda dos
// fluxos do paciente é negada (403). Limite v0 (declarado no plan): a chave dá
// o papel "nutri do sistema"; escopo por nutri responsável entra com a auth real.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class NutriKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.NUTRI_API_KEY;
    if (!expected) return false; // fail-closed

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers['x-nutri-key'];
    return typeof provided === 'string' && provided === expected;
  }
}
