import { Logger } from '@nestjs/common';

const logger = new Logger('ConfigValidator');

export interface EnvironmentValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates critical environment variables and configuration for production security.
 * Fails fast on missing or insecure configurations in production without leaking secrets.
 */
export function validateEnvironmentConfig(
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentValidationResult {
  const isProduction = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. DATABASE_URL
  if (!env.DATABASE_URL || env.DATABASE_URL.trim() === '') {
    if (isProduction) {
      errors.push('DATABASE_URL is not set or is empty.');
    } else {
      warnings.push(
        'DATABASE_URL is not configured (non-production environment).',
      );
    }
  } else if (isProduction) {
    // Check for common default placeholder passwords in production
    const lowerDbUrl = env.DATABASE_URL.toLowerCase();
    if (
      lowerDbUrl.includes(':password@') ||
      lowerDbUrl.includes(':postgres@') ||
      lowerDbUrl.includes(':root@') ||
      lowerDbUrl.includes(':admin@') ||
      lowerDbUrl.includes(':secret@')
    ) {
      errors.push(
        'DATABASE_URL appears to contain a default or insecure database password in production.',
      );
    }
  }

  // 2. CORS configuration in production
  if (isProduction) {
    if (!env.CORS_ORIGIN || env.CORS_ORIGIN.trim() === '') {
      warnings.push(
        'CORS_ORIGIN is not configured in production. Defaulting to strict fail-closed (reject cross-origin requests).',
      );
    } else if (env.CORS_ORIGIN.trim() === '*') {
      errors.push(
        'CORS_ORIGIN cannot be wildcard "*" when credentials are enabled in production.',
      );
    }
  }

  if (errors.length > 0) {
    for (const err of errors) {
      logger.error(`[CONFIG_ERROR] ${err}`);
    }
    if (isProduction) {
      throw new Error(
        `Production environment configuration validation failed: ${errors.join('; ')}`,
      );
    }
  }

  if (warnings.length > 0) {
    for (const warn of warnings) {
      logger.warn(`[CONFIG_WARNING] ${warn}`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
