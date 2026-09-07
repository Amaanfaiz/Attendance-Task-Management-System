import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('webOrigin'), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Attendance & Task Management API')
    .setDescription(
      'NFR-015: generated OpenAPI documentation for supported APIs',
    )
    .setVersion('1.0')
    .addCookieAuth('atms_access')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `API listening on http://localhost:${port}/api/v1 (docs at /api/docs)`,
  );
}
bootstrap();
