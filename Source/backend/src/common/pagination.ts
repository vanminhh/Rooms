import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface ListMeta {
  page: number;
  limit: number;
  total: number;
}

// [ASSUMPTION A2-3] Vietnamese wording of the validation messages is proposed by the plan.
const PAGE_MSG = 'Trang không hợp lệ';
const LIMIT_MSG = `Số dòng mỗi trang phải từ 1 đến ${MAX_LIMIT}`;

export class PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: PAGE_MSG })
  @Min(1, { message: PAGE_MSG })
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: LIMIT_MSG })
  @Min(1, { message: LIMIT_MSG })
  @Max(MAX_LIMIT, { message: LIMIT_MSG })
  limit?: number;
}

export function pageParams(q: PaginationQuery): {
  page: number;
  limit: number;
  skip: number;
  take: number;
} {
  const page = q.page ?? 1;
  const limit = q.limit ?? DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

// Marker class: the interceptor unwraps lists by `instanceof`, never by guessing the object shape.
export class Paginated<T> {
  constructor(
    readonly data: T[],
    readonly meta: ListMeta,
  ) {}
}

export function paginated<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): Paginated<T> {
  return new Paginated(data, { page, limit, total });
}
