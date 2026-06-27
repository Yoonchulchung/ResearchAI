import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from 'src/app.module';
import { Reflector } from '@nestjs/core';
import { GlobalExceptionFilter } from 'src/shared/filters/global-exception.filter';
import { ResponseInterceptor } from 'src/shared/interceptors/response.interceptor';

import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    bodyParser: false,
  });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));

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
