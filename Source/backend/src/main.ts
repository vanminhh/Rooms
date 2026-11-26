import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { configureApp } from './app.setup.js';
import { validateEnv } from './common/env.js';

async function bootstrap() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (existsSync('../.env')) process.loadEnvFile('../.env');
  validateEnv();
  // AppModule reads NODE_ENV when it registers scheduled jobs.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
