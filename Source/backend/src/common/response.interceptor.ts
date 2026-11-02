import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Paginated, type ListMeta } from './pagination.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ data: unknown; meta?: ListMeta }> {
    return next.handle().pipe(
      map((value: unknown) =>
        value instanceof Paginated
          ? { data: value.data, meta: value.meta }
          : { data: value ?? null },
      ),
    );
  }
}
