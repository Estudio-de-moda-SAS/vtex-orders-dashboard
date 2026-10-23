import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface AttemptWindow {
  count: number;
  windowStart: number;
}

/**
 * Límite de uso de `/api/assistant/chat` — cada pregunta gasta dinero real
 * de la API de Anthropic, así que este guard es la única defensa contra un
 * loop accidental (o deliberado) del frontend. Mismo patrón que
 * `BudgetCodeGuard`: mapas en memoria, aceptable para una herramienta
 * interna de bajo tráfico en una sola instancia.
 */
@Injectable()
export class AssistantRateLimitGuard implements CanActivate {
  private readonly attemptsByIp = new Map<string, AttemptWindow>();
  private globalDayWindow: AttemptWindow = { count: 0, windowStart: Date.now() };
  private readonly perMinuteWindowMs = 60_000;
  private readonly perDayWindowMs = 24 * 60 * 60_000;

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? 'unknown';

    const perMinuteLimit = this.configService.get<number>('app.assistant.rateLimitPerMinute', 6);
    const perDayLimit = this.configService.get<number>('app.assistant.rateLimitPerDayGlobal', 200);

    this.enforce(this.attemptsByIp, ip, this.perMinuteWindowMs, perMinuteLimit, 'Demasiadas preguntas seguidas — espera un minuto e intenta de nuevo.');

    const now = Date.now();
    if (now - this.globalDayWindow.windowStart > this.perDayWindowMs) {
      this.globalDayWindow = { count: 0, windowStart: now };
    }
    this.globalDayWindow.count += 1;
    if (this.globalDayWindow.count > perDayLimit) {
      throw new HttpException('Se alcanzó el límite diario de preguntas al asistente — intenta de nuevo mañana.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private enforce(map: Map<string, AttemptWindow>, key: string, windowMs: number, limit: number, message: string): void {
    const now = Date.now();
    const existing = map.get(key);
    if (!existing || now - existing.windowStart > windowMs) {
      map.set(key, { count: 1, windowStart: now });
      return;
    }
    existing.count += 1;
    if (existing.count > limit) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
