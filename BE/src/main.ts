import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  // media/data/backgrounds 폴더를 /backgrounds URL로 정적 서빙
  app.useStaticAssets(join(process.cwd(), 'media', 'data', 'backgrounds'), {
    prefix: '/backgrounds',
  });
  await app.listen(3001);
  console.log('🚀 BE running on http://localhost:3001/api');
}
bootstrap();
