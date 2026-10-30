import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/errors/globalException.filter.js';

/** Shared by main.ts and the e2e tests, so both run the exact same request pipeline. */
export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Harmattan API')
    .setDescription('Multi-currency stablecoin wallet sandbox: wallets, deposits, FX swaps, cross-border transfers and rates.')
    .setVersion('1.0.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}
