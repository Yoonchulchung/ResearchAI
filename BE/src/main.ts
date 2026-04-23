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

  // Electron 패키징 시 MEDIA_PATH 환경변수로 경로 주입, 없으면 CWD 기준
  const mediaBase = process.env.MEDIA_PATH ?? join(process.cwd(), 'media');
  app.useStaticAssets(join(mediaBase, 'data', 'backgrounds'), {
    prefix: '/backgrounds',
  });

  const port = process.env.PORT ?? 3001;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 BE running on http://${host}:${port}/api`);
}
bootstrap();
