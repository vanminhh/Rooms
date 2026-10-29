import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, IDS } from '../../../test/fixtures/fake-prisma.js';
import { TokenService } from '../auth/token.service.js';

// Outside edge replaced: PrismaService -> in-memory fake (the DB).
// Real: AppModule, guards, SettingsController/Service, configureApp (pipe, filter, { data } interceptor).

const SECRET = 'settings-spec-secret-0123456789abcdef-01';

let app: INestApplication;
let fake: FakePrisma;
let tokens: TokenService;
let savedSecret: string | undefined;

const tokenFor = (key: keyof typeof IDS.users) =>
  tokens.signAccessToken({ id: IDS.users[key], role: fake.account(key).role as Role });
const contact = (token?: string) => {
  const req = request(app.getHttpServer()).get('/api/v1/public/contact');
  return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
};

// Value of settings.default_contact in the seed (docs/spec AUTH-10: phone, Zalo, Facebook of the Boss).
const SEED_CONTACT = {
  phone: '0900000001',
  zaloUrl: 'https://zalo.me/0900000001',
  facebookUrl: 'https://facebook.com/tro.thong.minh',
};
const putDefaultContact = (value: unknown) => fake.setting.load([{ key: 'default_contact', value }]);

beforeAll(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  fake = await createFakePrisma();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(fake)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  tokens = app.get(TokenService, { strict: false });
});

afterAll(async () => {
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

beforeEach(() => fake.reset());

describe('AUTH-10: GET /public/contact', () => {
  it('AUTH-10: works without login and returns the seeded Boss contact', async () => {
    const res = await contact();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: SEED_CONTACT });
  });

  it('AUTH-10 / P4: still 200 for a tenant who must change password (public route skips AUTH-05)', async () => {
    expect(fake.account('tenant').mustChangePassword).toBe(true);
    const res = await contact(await tokenFor('tenant'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: SEED_CONTACT });
  });

  it('AUTH-10: a garbage token does not block a public route', async () => {
    const res = await contact('rac');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: SEED_CONTACT });
  });

  it('AUTH-10: a token of a locked account does not block a public route', async () => {
    const res = await contact(await tokenFor('lockedTenant'));
    expect(res.status).toBe(200);
  });

  it('AUTH-10 (P11): extra keys in the setting value are not exposed', async () => {
    putDefaultContact({ ...SEED_CONTACT, note: 'x', secret: 'internal' });
    const res = await contact();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: SEED_CONTACT });
    expect(Object.keys(res.body.data).sort()).toEqual(['facebookUrl', 'phone', 'zaloUrl']);
    expect(JSON.stringify(res.body)).not.toContain('internal');
  });

  it('AUTH-10 (P11): a missing key becomes null', async () => {
    putDefaultContact({ phone: '0900000001', facebookUrl: 'https://facebook.com/tro.thong.minh' });
    const res = await contact();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { phone: '0900000001', zaloUrl: null, facebookUrl: 'https://facebook.com/tro.thong.minh' },
    });
  });

  it('AUTH-10 (P11): no default_contact row -> { data: null }', async () => {
    fake.setting.load([]);
    const res = await contact();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it('AUTH-10 (P11): other settings rows are never read or exposed', async () => {
    fake.setting.load([
      { key: 'email_templates', value: { reset: 'TOP-SECRET-TEMPLATE' } },
      { key: 'default_contact', value: SEED_CONTACT },
    ]);
    const res = await contact();
    expect(res.body).toEqual({ data: SEED_CONTACT });
    expect(JSON.stringify(res.body)).not.toContain('TOP-SECRET-TEMPLATE');
  });

  it('AUTH-10: a value that is not an object yields all-null contact, not a crash', async () => {
    for (const bad of ['text', 42, ['0900000001'], null]) {
      putDefaultContact(bad);
      const res = await contact();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { phone: null, zaloUrl: null, facebookUrl: null } });
    }
  });

  it('AUTH-10: the route is read-only (POST /public/contact -> 404 NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/public/contact').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
