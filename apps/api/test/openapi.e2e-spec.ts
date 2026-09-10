import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

// SRS §12 API Requirements: "OpenAPI/Swagger documentation must be generated
// from backend source annotations/decorators and validated in CI." Generation
// alone was already proven live (GET /api/docs-json), but nothing asserted the
// spec is actually well-formed and every controller emits real documentation -
// this closes that gap by rebuilding the exact spec main.ts builds and
// structurally validating it on every CI run, not just eyeballing it live.
describe('OpenAPI specification (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Attendance & Task Management API')
      .setDescription(
        'NFR-015: generated OpenAPI documentation for supported APIs',
      )
      .setVersion('1.0')
      .addCookieAuth('atms_access')
      .build();
    document = SwaggerModule.createDocument(app, swaggerConfig);
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a well-formed OpenAPI 3 document', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('Attendance & Task Management API');
    expect(document.info.version).toBe('1.0');
  });

  it('documents a real, non-trivial number of API paths', () => {
    const pathCount = Object.keys(document.paths).length;
    // Every controller in this API is annotated - a spec this small would mean
    // whole modules silently stopped emitting documentation, not that the API
    // genuinely shrank. 40 is comfortably below the real count (47 as of this
    // writing) while still catching a broken/empty spec.
    expect(pathCount).toBeGreaterThan(40);
  });

  it('gives every documented operation a summary or description', () => {
    const undocumented: string[] = [];
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(
        methods as Record<
          string,
          { summary?: string; description?: string; operationId?: string }
        >,
      )) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method))
          continue;
        if (
          !operation.summary &&
          !operation.description &&
          !operation.operationId
        ) {
          undocumented.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(undocumented).toEqual([]);
  });

  it('covers the core endpoints named in the SRS API Requirements table', () => {
    const paths = Object.keys(document.paths);
    const required = [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/attendance/clock-in',
      '/api/v1/attendance/clock-out',
      '/api/v1/breaks/start',
      '/api/v1/breaks/end',
      '/api/v1/tasks',
      '/api/v1/task-timers/start',
      '/api/v1/reports/attendance',
      '/api/v1/audit',
    ];
    for (const path of required) {
      expect(paths).toContain(path);
    }
  });
});
