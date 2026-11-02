import type { ArgumentsHost } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AllExceptionsFilter } from '../../common/errors/all-exceptions.filter.js';
import { ERRORS, ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { signRoomImageUpload, verifyRoomImage } from './files.service.js';
import type { SignUploadDto } from './dto/sign.dto.js';

// CP-5 (BE-P2-07) · FILE-01, FILE-02, ROOM-07, SCOPE-02, UI-05.
// Outside edges faked: Prisma (`db.room.findFirst` as an in-memory lookup) and the HTTP
// response object (`fakeHost`, reused from CP-1's all-exceptions.filter.spec.ts pattern).
// `AllExceptionsFilter` is real (already drafted in CP-1), not the unit under test here,
// so running a thrown exception through it proves the exact final response body per PLAN 2.7.
// The clock is injected explicitly (`now`), never read from the system.

interface RoomRow { id: number; buildingId: number; isActive: boolean }

function fakeRoomDb(rows: RoomRow[]): { db: Pick<PrismaClient, 'room'>; calls: unknown[] } {
  const calls: unknown[] = [];
  const db = {
    room: {
      findFirst: async (args: { where: { id: number }; select: Record<string, boolean> }) => {
        calls.push(args);
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) return null;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(args.select)) out[key] = (row as Record<string, unknown>)[key];
        return out;
      },
    },
  } as unknown as Pick<PrismaClient, 'room'>;
  return { db, calls };
}

function fakeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  return { host, status, json };
}

// Runs a thrown HttpException through the real filter and returns the exact wire response.
async function responseOf(fn: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
  const filter = new AllExceptionsFilter();
  const { host, status, json } = fakeHost();
  try {
    await fn();
    throw new Error('expected fn() to throw');
  } catch (e) {
    filter.catch(e, host);
  }
  return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] };
}

const BOSS: Pick<AuthUser, 'buildingIds'> = { buildingIds: null };
const managerOf = (ids: number[]): Pick<AuthUser, 'buildingIds'> => ({ buildingIds: ids });
const dto = (roomId: number): SignUploadDto => ({ purpose: 'ROOM_IMAGE', roomId });

const WITH_CLOUDINARY = { CLOUDINARY_URL: 'cloudinary://key123:secretABC@demo' };
const NOW = new Date('2026-11-01T10:00:00+07:00');

describe('CP-5 / BE-P2-07 / FILE-01: signRoomImageUpload', () => {
  it('scenario 6: CLOUDINARY_URL missing -> 503 UPLOAD_NOT_CONFIGURED, and the DB is never queried', async () => {
    const { db, calls } = fakeRoomDb([{ id: 1, buildingId: 1, isActive: true }]);
    const { status, body } = await responseOf(() => signRoomImageUpload(db, managerOf([1]), dto(1), {}, NOW));
    expect(status).toBe(503);
    expect(body).toEqual({ error: { code: 'UPLOAD_NOT_CONFIGURED', message: ERRORS[ErrorCode.UPLOAD_NOT_CONFIGURED].message } });
    expect(calls).toHaveLength(0);
  });

  it('scenario 8/9: manager of CG01 signs for a room in CG01 -> folder, formats, transformation, signature, timestamp, uploadUrl; no apiSecret anywhere', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const result = await signRoomImageUpload(db, managerOf([7]), dto(42), WITH_CLOUDINARY, NOW);
    expect(result.folder).toBe('rooms/7/42');
    expect(result.allowedFormats).toBe('jpg,png,webp');
    expect(result.transformation).toBe('c_limit,w_1920,h_1920');
    expect(result.cloudName).toBe('demo');
    expect(result.apiKey).toBe('key123');
    expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(result.timestamp).toBe(Math.floor(NOW.getTime() / 1000));
    expect(typeof result.signature).toBe('string');
    expect(result.signature).toHaveLength(40); // SHA-1 hex
    const rendered = JSON.stringify(result);
    expect(rendered).not.toContain('secretABC');
    expect(result).not.toHaveProperty('apiSecret');
  });

  it('scenario 10 (acceptance spec 11): manager of a different building -> 403 OUT_OF_SCOPE', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const { status, body } = await responseOf(() => signRoomImageUpload(db, managerOf([9]), dto(42), WITH_CLOUDINARY, NOW));
    expect(status).toBe(403);
    expect(body).toEqual({ error: { code: 'OUT_OF_SCOPE', message: ERRORS[ErrorCode.OUT_OF_SCOPE].message } });
  });

  it('scenario 11: BOSS (buildingIds = null) can sign for a room in any building', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const result = await signRoomImageUpload(db, BOSS, dto(42), WITH_CLOUDINARY, NOW);
    expect(result.folder).toBe('rooms/7/42');
  });

  it('scenario 12: roomId does not exist -> 404 NOT_FOUND', async () => {
    const { db } = fakeRoomDb([]);
    const { status, body } = await responseOf(() => signRoomImageUpload(db, BOSS, dto(999), WITH_CLOUDINARY, NOW));
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: ERRORS[ErrorCode.NOT_FOUND].message } });
  });

  it('scenario 13 (ROOM-04): room.isActive = false -> 404 NOT_FOUND', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: false }]);
    const { status, body } = await responseOf(() => signRoomImageUpload(db, BOSS, dto(42), WITH_CLOUDINARY, NOW));
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: ERRORS[ErrorCode.NOT_FOUND].message } });
  });
});

describe('CP-5 / BE-P2-07 / FILE-02: verifyRoomImage', () => {
  it('scenario 15: well-formed image -> builds the exact delivery URL', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const result = await verifyRoomImage(db, 42, { publicId: 'rooms/7/42/abc123', version: 1762000000, format: 'jpg' }, WITH_CLOUDINARY);
    expect(result).toEqual({
      publicId: 'rooms/7/42/abc123',
      url: 'https://res.cloudinary.com/demo/image/upload/v1762000000/rooms/7/42/abc123.jpg',
    });
  });

  it.each([
    ['wrong room in same building', 'rooms/7/43/abc'],
    ['wrong top-level folder', 'other/abc'],
    ['sibling folder with a shared prefix', 'rooms/7/42x/abc'],
    ['path traversal', 'rooms/7/42/../y'],
    ['nested subpath', 'rooms/7/42/a/b'],
  ])('scenario 16 (acceptance spec 11, %s): publicId %s -> 400 VALIDATION_FAILED + fields.publicId', async (_label, publicId) => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 42, { publicId, version: 1, format: 'jpg' }, WITH_CLOUDINARY),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: ERRORS[ErrorCode.VALIDATION_FAILED].message,
        fields: { publicId: 'Ảnh không thuộc phòng này' },
      },
    });
  });

  it.each(['gif', 'svg'])('scenario 17 (ROOM-07): format=%s -> 400 VALIDATION_FAILED + fields.format', async (format) => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 42, { publicId: 'rooms/7/42/abc', version: 1, format }, WITH_CLOUDINARY),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: ERRORS[ErrorCode.VALIDATION_FAILED].message,
        fields: { format: 'Định dạng ảnh không được hỗ trợ' },
      },
    });
  });

  it.each([
    ['JPG', 'jpg'],
    ['WebP', 'webp'],
  ])('scenario 17b: format=%s is accepted (lower-cased before the allow-list check and before the URL) -> url ends with .%s', async (input, lower) => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const result = await verifyRoomImage(db, 42, { publicId: 'rooms/7/42/abc', version: 1, format: input }, WITH_CLOUDINARY);
    expect(result.url.endsWith(`.${lower}`)).toBe(true);
  });

  it.each([0, -1, 1.5])('scenario 18: version=%s -> 400 VALIDATION_FAILED + fields.version', async (version) => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 42, { publicId: 'rooms/7/42/abc', version, format: 'jpg' }, WITH_CLOUDINARY),
    );
    expect(status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: ERRORS[ErrorCode.VALIDATION_FAILED].message,
        fields: { version: 'Phiên bản ảnh không hợp lệ' },
      },
    });
  });

  it('scenario 19: verifyRoomImage for a room in a different building -> folder mismatch -> fields.publicId (the client URL is never trusted/stored)', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    // image.publicId points at a folder for building 9, but the room looked up (id 42) is building 7.
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 42, { publicId: 'rooms/9/42/abc', version: 1, format: 'jpg' }, WITH_CLOUDINARY),
    );
    expect(status).toBe(400);
    expect((body as { error: { fields?: Record<string, string> } }).error.fields).toEqual({
      publicId: 'Ảnh không thuộc phòng này',
    });
  });

  it('scenario 21: CLOUDINARY_URL missing, even for a roomId that does not exist -> 503 UPLOAD_NOT_CONFIGURED, no DB query', async () => {
    const { db, calls } = fakeRoomDb([]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 999, { publicId: 'rooms/9/999/abc', version: 1, format: 'jpg' }, {}),
    );
    expect(status).toBe(503);
    expect(body).toEqual({ error: { code: 'UPLOAD_NOT_CONFIGURED', message: ERRORS[ErrorCode.UPLOAD_NOT_CONFIGURED].message } });
    expect(calls).toHaveLength(0);
  });

  it('scenario 22: roomId does not exist (CLOUDINARY_URL present) -> 404 NOT_FOUND (SCOPE-02 is the caller\'s job, not this function\'s)', async () => {
    const { db } = fakeRoomDb([]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 999, { publicId: 'rooms/9/999/abc', version: 1, format: 'jpg' }, WITH_CLOUDINARY),
    );
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: ERRORS[ErrorCode.NOT_FOUND].message } });
  });

  it('scenario 23: room.isActive = false, well-formed publicId -> still succeeds (ROOM-07/FILE-02 do not require the room to be active)', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: false }]);
    const result = await verifyRoomImage(db, 42, { publicId: 'rooms/7/42/abc', version: 1, format: 'png' }, WITH_CLOUDINARY);
    expect(result.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/rooms/7/42/abc.png');
  });

  it('coder decision check: publicId exactly "<folder>/" (empty remainder) is rejected as fields.publicId, not accepted as a valid (empty) file name', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 42, { publicId: 'rooms/7/42/', version: 1, format: 'jpg' }, WITH_CLOUDINARY),
    );
    expect(status).toBe(400);
    expect((body as { error: { fields?: Record<string, string> } }).error.fields).toEqual({
      publicId: 'Ảnh không thuộc phòng này',
    });
  });

  it('coder decision check: a bad format AND a bad version together are both reported in one VALIDATION_FAILED body (not only the first)', async () => {
    const { db } = fakeRoomDb([{ id: 42, buildingId: 7, isActive: true }]);
    const { status, body } = await responseOf(() =>
      verifyRoomImage(db, 42, { publicId: 'rooms/7/42/abc', version: -1, format: 'gif' }, WITH_CLOUDINARY),
    );
    expect(status).toBe(400);
    expect((body as { error: { fields?: Record<string, string> } }).error.fields).toEqual({
      format: 'Định dạng ảnh không được hỗ trợ',
      version: 'Phiên bản ảnh không hợp lệ',
    });
  });
});
