/**
 * Qor openapi.json — frontend-ku types-ka halkan ayuu ka sameeyaa (openapi-typescript).
 * npm run openapi
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { AppModule } from '../src/app.module';

async function main() {
  process.env.JOBS_ENABLED = 'false';
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Cabdinasir Bus API').setVersion('0.2.0').addBearerAuth().build());
  writeFileSync('openapi.json', JSON.stringify(doc, null, 2));
  await app.close();
  console.log(`openapi.json: ${Object.keys(doc.paths).length} paths`);
}
void main();
