import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface AttemptWindow {
  count: number;
  windowStart: number;
}

/**
 * Protege TODOS los endpoints de `/api/budgets` que reciben `code` en el
 * body (`verify-code`, `POST /multiplier`, `POST /bulk`) con la MISMA
 * validación y el MISMO límite de intentos por IP. Si el rate-limit
 * viviera solo en `verify-code`, alguien podría saltárselo atacando
 * directamente `/bulk` o `/multiplier` (que también validan `code`).
 *
 * Código compartido simple (no un sistema de usuarios, ver
 * `AppConfig.budgets.accessCode`) — el límite de intentos es la única
 * defensa real contra fuerza bruta, así que se aplica parejo en las tres
 * rutas, no solo en la que "parece" ser el login.
 *
 * El mapa de intentos por IP vive en memoria y crece con cada IP distinta
 * que pase por acá — aceptable para una herramienta interna de bajo
 * tráfico; no hace falta limpieza activa a esta escala.
 */
@Injectable()
export class BudgetCodeGuard implements CanActivate {
  private readonly attemptsByIp = new Map<string, AttemptWindow>();
  private readonly windowMs = 60_000;
  private readonly maxAttemptsPerWindow = 5;

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.enforceRateLimit(request.ip ?? 'unknown');

    const expectedCode = this.configService.get<string | null>('app.budgets.accessCode');
    const providedCode = (request.body as { code?: unknown } | undefined)?.code;
    if (!expectedCode || typeof providedCode !== 'string' || providedCode !== expectedCode) {
      throw new UnauthorizedException('Código incorrecto.');
    }
    return true;
  }

  private enforceRateLimit(ip: string): void {
    const now = Date.now();
    const existing = this.attemptsByIp.get(ip);
    if (!existing || now - existing.windowStart > this.windowMs) {
      this.attemptsByIp.set(ip, { count: 1, windowStart: now });
      return;
    }
    existing.count += 1;
    if (existing.count > this.maxAttemptsPerWindow) {
      throw new HttpException('Demasiados intentos — espera un minuto e intenta de nuevo.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
