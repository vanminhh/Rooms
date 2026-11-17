import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';

// The real module, guards, pipe and controller run with fake Prisma reads and local signing.
describe('BE-P3-04 / FILE-01: POST /files/sign (e2e)', () => {
  let app: INestApplication;
  const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT']]);
  const contracts = new Map([[42, { id: 42, buildingId: 7 }], [43, { id: 43, buildingId: 9 }]]);
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
        const role = roles.get(where.id);
        return role ? { id: where.id, role, isActive: true, mustChangePassword: false } : null;
      }),
    },
    building: { findMany: vi.fn().mockResolvedValue([{ id: 7 }]) },
    contract: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => contracts.get(where.id) ?? null),
    },
    room: { findFirst: vi.fn().mockResolvedValue({ id: 9, buildingId: 7, isActive: true }) },
  };

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://test-key:test-secret@rooms-demo');
    vi.stubEnv('JWT_SECRET', 'test-only-files-signing-jwt-secret');
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const sign = () => request(app.getHttpServer()).post('/api/v1/files/sign');
  const bearer = async (id: number, role: Role) => 'Bearer ' + await app.get(TokenService).signAccessToken({ id, role });

  it.each([
    ['CONTRACT_SCAN', 'jpg,png,webp,pdf', 'contract-scan-'],
    ['ID_PHOTO', 'jpg,png,webp', 'id-photo-'],
  ])('FILE-01 / D-37: a manager receives authenticated upload parameters for %s in scope', async (purpose, formats, prefix) => {
    const res = await sign().set('Authorization', await bearer(2, 'MANAGER')).send({ purpose, contractId: '42' }).expect(201);
    expect(res.body.data).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/rooms-demo/image/upload',
      type: 'authenticated', folder: 'contracts/7/42', allowedFormats: formats,
      publicId: expect.stringMatching(new RegExp('^' + prefix + '[a-f0-9-]{36}$')), overwrite: false,
    });
  });

  it('FILE-01 / SCOPE-02: another building returns OUT_OF_SCOPE', async () => {
    const res = await sign().set('Authorization', await bearer(2, 'MANAGER'))
      .send({ purpose: 'ID_PHOTO', contractId: 43 }).expect(403);
    expect(res.body.error.code).toBe('OUT_OF_SCOPE');
  });

  it('FILE-01 / SCOPE-01: a tenant may not sign private uploads', async () => {
    const res = await sign().set('Authorization', await bearer(3, 'TENANT'))
      .send({ purpose: 'CONTRACT_SCAN', contractId: 42 }).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('FILE-01 / API-04: rejects a room ID and a delivery type supplied for a contract upload', async () => {
    const res = await sign().set('Authorization', await bearer(1, 'BOSS'))
      .send({ purpose: 'ID_PHOTO', contractId: 42, roomId: 9, type: 'upload' }).expect(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED', fields: { roomId: expect.any(String), type: expect.any(String) },
    });
  });

  it('FILE-01: ROOM_IMAGE retains its public upload response shape', async () => {
    const res = await sign().set('Authorization', await bearer(2, 'MANAGER'))
      .send({ purpose: 'ROOM_IMAGE', roomId: '9' }).expect(201);
    expect(res.body.data).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/rooms-demo/image/upload',
      folder: 'rooms/7/9', allowedFormats: 'jpg,png,webp', transformation: 'c_limit,w_1920,h_1920',
    });
    expect(res.body.data).not.toHaveProperty('type');
  });
});
