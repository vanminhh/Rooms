import { BadRequestException, HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { mapDbError } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { parseReading, saveReading } from './save-reading.js';

type SavedReading = Awaited<ReturnType<typeof saveReading>>;
type ReadingResult = { index: number; ok: true; data: SavedReading } | { index: number; ok: false; error: ErrorCode };

export async function recordBatch(db: PrismaService, actor: AuthUser, items: unknown,
  finalize: (tx: Prisma.TransactionClient, reading: SavedReading) => Promise<SavedReading>, afterCommit?: (reading: SavedReading) => Promise<void>): Promise<ReadingResult[]> {
  if (!Array.isArray(items) || !items.length) throw new BadRequestException(ErrorCode.VALIDATION_FAILED);
  const results: ReadingResult[] = [];
  for (const [index, raw] of items.entries()) {
    try {
      const item = parseReading(raw);
      const data = await db.$transaction(async tx => finalize(tx, await saveReading(tx, actor, item)));
      if (afterCommit) await afterCommit(data);
      results.push({ index, ok: true, data });
    } catch (error) {
      const code = error instanceof HttpException && Object.values(ErrorCode).includes(error.message as ErrorCode)
        ? error.message as ErrorCode : mapDbError(error)?.code;
      if (!code) throw error;
      results.push({ index, ok: false, error: code });
    }
  }
  return results;
}
