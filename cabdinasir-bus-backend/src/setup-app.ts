import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/http-exception.filter';

/**
 * Isku dejin la wadaago main.ts iyo e2e tests.
 * App-ka waa in lagu abuuraa `{ bodyParser: false }` — halkan ayaa body limit-ka la dejiyaa
 * (offline sync: ilaa 200 alaab hal mar → 2 MB).
 */
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean), credentials: true });

  // Swagger: production-ka waa xiran yahay ilaa SWAGGER_ENABLED=true (khariidadda API-ga dadka kama muuqato)
  const swagger = process.env.SWAGGER_ENABLED ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true');
  if (swagger === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Cabdinasir Bus API')
      .setDescription('Rakaab, kuraas, alaab iyo lacag — Boorama (2 laamood) · Wajaale')
      .setVersion('0.6.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  return app;
}
