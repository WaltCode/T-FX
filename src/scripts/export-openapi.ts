import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument } from '../app.setup.js';

const app = await NestFactory.create(AppModule, { logger: ['error'] });
await writeFile('openapi.json', `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
await app.close();
console.log('Wrote openapi.json');
