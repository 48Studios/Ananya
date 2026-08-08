import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LocationExceptionFilter } from './locations/location-exception.filter';
import { Logger, ValidationPipe } from '@nestjs/common';
import { runStartupMigrations } from '@ananya/database/startup-migrations';

async function bootstrap() {
  const logger = new Logger('Startup');

  try {
    await runStartupMigrations();
  } catch (error) {
    logger.error(
      'Database startup migrations failed. Terminating API startup.',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : true;

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalFilters(new LocationExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 4000;

  await app.listen(port, '0.0.0.0');

  console.log(`Ananya API running on http://0.0.0.0:${port}`);
}

void bootstrap();
