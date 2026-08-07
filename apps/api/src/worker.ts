import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import http from 'http';

const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrapWorker() {
  console.log('⚙️ Starting Ananya ERP Background Worker Service...');

  // Initialize NestJS application context (headless background processing)
  const appContext = await NestFactory.createApplicationContext(AppModule);
  console.log(
    '✅ NestJS application context initialized for background worker.',
  );

  const workerPort = parseInt(process.env.WORKER_PORT ?? '4001', 10);

  // Lightweight HTTP Healthcheck server for Docker & K8s probes
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'ananya-worker',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        }),
      );
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });

  server.listen(workerPort, '0.0.0.0', () => {
    console.log(
      `📡 Ananya Worker healthcheck server listening on 0.0.0.0:${workerPort}`,
    );
  });

  // Background Job Loop Simulator & Queue Processor
  const intervalId = setInterval(() => {
    // Background worker interval tick: notifications, scheduled workflows, import/export cleanup
    const timestamp = new Date().toISOString();
    // Silent worker tick logging in verbose mode
    if (process.env.DEBUG_WORKER === 'true') {
      console.log(
        `[${timestamp}] [Ananya-Worker] Background tasks check executed.`,
      );
    }
  }, 30000);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(
      `\n🛑 Received ${signal}. Shutting down Ananya Worker gracefully...`,
    );
    clearInterval(intervalId);
    server.close();
    await appContext.close();
    console.log('👋 Worker process stopped cleanly.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrapWorker();
