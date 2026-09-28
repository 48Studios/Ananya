import dotenv from 'dotenv';

dotenv.config();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { LocationExceptionFilter } from './locations/location-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { HttpLoggingInterceptor } from './common/logging/http-logging.interceptor';
import { validateEnvironmentConfig } from './common/config/production-config.validator';
import { resolveCorsOrigin } from './common/config/cors.config';

async function bootstrap() {
  // Validate production configuration fast before starting listeners
  validateEnvironmentConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust upstream reverse proxy (e.g. Caddy, Nginx, Cloudflare) for accurate client IP resolution
  app.set('trust proxy', true);

  // Harden HTTP headers: disable technology fingerprinting and enforce security policies
  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );

    // Enable HSTS conditionally when running over HTTPS or when explicitly enabled
    const isHttps =
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https' ||
      process.env.ENABLE_HSTS === 'true';

    if (isHttps) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    next();
  });

  const corsOrigin = resolveCorsOrigin(
    process.env.NODE_ENV,
    process.env.CORS_ORIGIN,
  );

  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalFilters(new LocationExceptionFilter());
  app.useGlobalInterceptors(new HttpLoggingInterceptor());
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
