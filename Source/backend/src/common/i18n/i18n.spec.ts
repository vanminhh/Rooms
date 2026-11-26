import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma } from '../../../test/fixtures/fake-prisma.js';
import { AuthService } from '../../modules/auth/auth.service.js';
import { MailerService, type Mail } from '../../modules/mailer/mailer.service.js';
import { ERRORS, ErrorCode } from '../errors/error-code.js';
import { buildEstimate } from '../rooms/monthly-estimate.js';
import { isTranslatedPath, localeOf, mailLocale } from './locale.js';
import { ERRORS_EN, FIELDS_EN, errorMessage, translateField } from './messages.js';
import { MAILS, selectMail } from './mails.js';

describe('LOC-02/04/06: language boundaries', () => {
  it.each(['en', 'en-US', 'en-GB', 'EN', 'en,vi;q=0.9'])('Q-EX3-4: %s selects English', value => {
    expect(localeOf({ headers: { 'accept-language': value } })).toBe('en');
  });
  it.each([undefined, '', 'fr', 'vi,en;q=0.9', 'english', ['en']])('LOC-02: other headers fall back to Vietnamese (%s)', value => {
    expect(localeOf({ headers: { 'accept-language': value } })).toBe('vi');
  });
  it('LOC-02: only complete public/auth/me path segments are translated', () => {
    for (const path of ['/api/v1/public', '/api/v1/auth/login', '/api/v1/me/viewings']) expect(isTranslatedPath(path)).toBe(true);
    for (const path of [undefined, '/auth/login', '/api/v1/authentic', '/api/v1/rooms', '/api/v1/me-other']) expect(isTranslatedPath(path)).toBe(false);
  });
  it('LOC-04: all error codes have English copy, missing fields stay as typed', () => {
    expect(Object.keys(ERRORS_EN).sort()).toEqual(Object.keys(ERRORS).sort());
    for (const code of Object.values(ErrorCode)) {
      expect(ERRORS_EN[code].trim()).not.toBe('');
      expect(ERRORS_EN[code]).not.toBe(ERRORS[code].message);
      expect(errorMessage(code, 'vi')).toBe(ERRORS[code].message);
    }
    expect(translateField('Tên người nhập', 'en')).toBe('Tên người nhập');
    expect(translateField('constructor', 'en')).toBe('constructor');
  });
  it('LOC-02: field catalog covers auth, public rooms, account viewings and tenant occupant inputs', () => {
    const found = new Set<string>();
    for (const path of ['common/errors/validation.ts', 'common/pagination.ts', 'modules/auth/dto/auth.dto.ts', 'modules/auth/auth.service.ts', 'modules/rooms/dto/public-rooms.dto.ts', 'modules/viewings/dto/viewings.dto.ts', 'modules/viewings/viewing-time.ts', 'modules/viewings/viewing-validation.ts', 'modules/contracts/dto/occupants.dto.ts', 'modules/contracts/contract-occupants.service.ts', 'common/rooms/occupant-capacity.ts', 'modules/chatbot/dto/chat.dto.ts']) {
      const source = ts.createSourceFile(path, readFileSync(`src/${path}`, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
          let text = ts.isTemplateExpression(node) ? node.getText(source).slice(1, -1) : node.text;
          text = text.replace('${MAX_LIMIT}', '100').replace('${PASSWORD_MIN_LENGTH}', '8');
          if (/[\u0080-\uffff]/.test(text)) found.add(text);
        }
        // Template spans are processed as a whole above, not as fragments.
        if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
      };
      visit(source);
    }
    // The catalog also includes shared provider errors exercised by the tenant
    // HTTP tests; require every scanned message without forbidding other entries.
    expect([...found].filter(text => !Object.hasOwn(FIELDS_EN, text))).toEqual([]);
    for (const [vi, en] of Object.entries(FIELDS_EN)) { expect(en.trim()).not.toBe(''); expect(en).not.toBe(vi); }
  });
  it('LOC-05, A-12: translating estimates preserves money and entered service names', () => {
    const input = { price: 2984000, waterMode: 'PER_M3' as const, water: null, services: [{ name: 'Dọn phòng', unit: 'ROOM' as const, rate: null }] };
    const vi = buildEstimate(input), en = buildEstimate(input, 'en');
    expect(en.deposit).toBe(2984000);
    expect(en.monthlyEstimate).toBe(vi.monthlyEstimate);
    expect(en.estimate.items).toEqual([{ label: 'Rent', amount: 2984000 }]);
    expect(en.estimate.missing).toEqual(['excludes: Dọn phòng (no rate available)']);
  });
  it('LOC-06: guest/tenant mail follows saved locale; staff mail is Vietnamese', () => {
    for (const role of ['GUEST', 'TENANT']) expect(mailLocale({ role, locale: 'en' })).toBe('en');
    for (const role of ['BOSS', 'MANAGER']) expect(mailLocale({ role, locale: 'en' })).toBe('vi');
    expect(MAILS.verifyCode('en', '123456').text).toContain('123456');
    expect(MAILS.verifyCode('en', '123456').text).toContain('5 minutes');
    expect(MAILS.resetLink('en', 'https://example.test/reset').text).toContain('30 minutes');
    expect(MAILS.resetLink('vi', 'URL').subject).toBe('Đặt lại mật khẩu – Trọ Thông Minh');
    const vietnamese = { subject: 'Tiêu đề', text: 'Nội dung' };
    expect(selectMail('en', { subject: '', text: 'Body' }, vietnamese)).toEqual(vietnamese);
    expect(selectMail('en', { subject: 'Subject', text: ' ' }, vietnamese)).toEqual(vietnamese);
  });
});

describe('LOC-02, API-03: real HTTP error pipeline', () => {
  let app: INestApplication;
  let fake: FakePrisma;
  const send = vi.fn<(mail: Mail) => Promise<void>>().mockResolvedValue(undefined);
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'i18n-test-only-secret-0123456789abcdef');
    fake = await createFakePrisma();
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(fake).overrideProvider(MailerService).useValue({ send }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  it('LOC-06: registration, resend and recovery actually deliver the saved language', async () => {
    const auth = app.get(AuthService);
    await auth.register({ fullName: 'Khách Test', phone: '0912345678', email: 'locale@example.test', password: 'TestPass123' }, 'en', 'test-ip');
    expect(send.mock.lastCall?.[0].subject).toBe('Email verification code - Trọ Thông Minh');
    expect(send.mock.lastCall?.[0].text).toMatch(/Your verification code: \d{6}/);
    // Move only Date beyond the resend cooldown; timers still run for background delivery.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    try {
      send.mockClear();
      auth.resendCode({ phone: '0912345678' }, 'test-ip');
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(send.mock.lastCall?.[0].subject).toBe('Email verification code - Trọ Thông Minh');
    } finally { vi.useRealTimers(); }
    for (const [key, subject] of [['tenant', 'Reset your password – Trọ Thông Minh'], ['boss', 'Đặt lại mật khẩu – Trọ Thông Minh']] as const) {
      const user = fake.account(key);
      user.locale = 'en'; user.email = `${key}@example.test`;
      send.mockClear();
      await auth.forgotPassword({ phone: user.phone });
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(send.mock.lastCall?.[0].subject).toBe(subject);
      expect(send.mock.lastCall?.[0].text).toContain('/quen-mat-khau?token=');
    }
  });
  it('LOC-02: wrong login in English; fr falls back; staff endpoint stays Vietnamese', async () => {
    const en = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Accept-Language', 'en-US').send({ phone: '0900000001', password: 'wrong' }).expect(401);
    expect(en.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect phone number or password' } });
    expect(en.headers.vary).toContain('Accept-Language');
    const fr = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Accept-Language', 'fr').send({ phone: '0900000001', password: 'wrong' }).expect(401);
    expect(fr.body.error.message).toBe('Số điện thoại hoặc mật khẩu không đúng');
    const staff = await request(app.getHttpServer()).get('/api/v1/rooms').set('Accept-Language', 'en').expect(401);
    expect(staff.body.error.message).toBe('Bạn cần đăng nhập để tiếp tục');
  });
  it('LOC-02: DTO fields and unknown fields are translated without changing keys', async () => {
    const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Accept-Language', 'en').send({ phone: '123', password: '', extra: true }).expect(400);
    expect(result.body.error).toEqual({ code: 'VALIDATION_FAILED', message: 'Invalid input', fields: { phone: 'Invalid phone number', password: 'Please enter your password', extra: 'This field is not allowed' } });
  });
});
