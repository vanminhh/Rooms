import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { validationExceptionFactory } from './common/errors/validation.js';
import { ResponseInterceptor } from './common/response.interceptor.js';

// Shared by main.ts and tests. No CORS: the frontend uses the Vite proxy.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  // Nest 12 mounts its 404 handler only under the prefix, so other paths would get Express's HTML 404 (API-03).
  // shortcut: case-sensitive match, update this guard if a route ever lives outside /api/v1.
  app.use((req: Request, _res: Response, next: NextFunction) =>
    req.path === '/api/v1' || req.path.startsWith('/api/v1/') ? next() : next(new NotFoundException()),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
