import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Kaliya marka proxy (Caddy) hor fadhiyo — haddii kale X-Forwarded-For waa la been abuuri karaa (rate limit ka gudub)
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.enableShutdownHooks(); // SIGTERM → requests-ka socda way dhammaystirmaan, DB-ga si nadiif ah ayuu u xirmaa
  setupApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API: http://localhost:${port}/api/v1 · Docs: http://localhost:${port}/api/docs`, 'Bootstrap');
}
void bootstrap();
