import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { tap } from 'rxjs';
import type { Express, NextFunction, Request, Response } from 'express';
import { trustProxyHops } from './common/env.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { validationExceptionFactory } from './common/errors/validation.js';
import { ResponseInterceptor } from './common/response.interceptor.js';

// Shared by main.ts and tests. No CORS: the frontend uses the Vite proxy.
export function configureApp(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', trustProxyHops());
  app.setGlobalPrefix('api/v1');
  // Nest 12 mounts its 404 handler only under the prefix, so other paths would get Express's HTML 404 (API-03).
  // shortcut: case-sensitive match, update this guard if a route ever lives outside /api/v1.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.vary('Accept-Language');
    res.set('Cache-Control', 'no-store');
    return req.path === '/api/v1' || req.path.startsWith('/api/v1/') ? next() : next(new NotFoundException());
  }
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalInterceptors({
    intercept(context, next) {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      if (req.method !== 'GET' || !req.path.startsWith('/api/v1/public/')) return next.handle();
      const res = http.getResponse<Response>();
      return next.handle().pipe(tap(() => {
        if (res.statusCode === 200) res.set('Cache-Control', 'public, max-age=0, s-maxage=60');
      }));
    },
  });
}
