import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const frontendOrigins = configService.get<string[]>('app.frontendOrigins', [
    'http://localhost:3000',
  ]);

  app.enableCors({
    origin: frontendOrigins,
    methods: ['GET', 'POST'],
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = configService.get<number>('app.port', 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Backend VTEX Orders Dashboard escuchando en http://localhost:${port}`);
}

bootstrap();
