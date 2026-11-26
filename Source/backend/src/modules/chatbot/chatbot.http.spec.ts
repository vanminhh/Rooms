import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { ERRORS_EN } from '../../common/i18n/messages.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { PublicBuildingsService } from '../buildings/public-buildings.service.js';
import { PublicRoomsService } from '../rooms/public-rooms.service.js';
import { TokenService } from '../auth/token.service.js';
import { ANTHROPIC_CLIENT } from './anthropic.provider.js';
import { ChatbotModule } from './chatbot.module.js';

// CHAT-01/03/06/07 HTTP contract. Real guards, ValidationPipe, controller, ChatbotService, error filter and
// interceptor run through an HTTP server; only the Anthropic client and the database edge are faked.

const user = (content: string) => ({ role: 'user', content });
const assistant = (content: string) => ({ role: 'assistant', content });

async function boot(client: unknown, db: Record<string, unknown> = {}): Promise<INestApplication> {
  const testingModule = Test.createTestingModule({
    imports: [JwtModule.register({}), ChatbotModule],
    providers: [
      TokenService,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: MustChangePasswordGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  });
  testingModule.overrideProvider(PrismaService).useValue(db);
  testingModule.overrideProvider(ANTHROPIC_CLIENT).useValue(client);
  testingModule.overrideProvider(PublicRoomsService).useValue({ list: vi.fn(), detail: vi.fn() });
  testingModule.overrideProvider(PublicBuildingsService).useValue({ locations: vi.fn(), detail: vi.fn() });
  const app = (await testingModule.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('POST /api/v1/public/chat (CHAT-01..07)', () => {
  const toolRunner = vi.fn();
  let app: INestApplication;
  const post = (body: unknown, lang?: string) => {
    const req = request(app.getHttpServer()).post('/api/v1/public/chat');
    return (lang ? req.set('Accept-Language', lang) : req).send(body as object);
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    app = await boot({ beta: { messages: { toolRunner } } });
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });
  beforeEach(() => {
    toolRunner.mockReset();
    toolRunner.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Có phòng A101 giá 3.000.000 đ.' }] });
  });

  it('CHAT-01: no login needed; one user message -> 200 { data: { reply } } with Cache-Control: no-store', async () => {
    const res = await post({ messages: [user('Phòng dưới 4 triệu?')] }).expect(200);
    expect(res.body).toEqual({ data: { reply: 'Có phòng A101 giá 3.000.000 đ.' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CHAT-01, A-29: 19 alternating messages ending with the visitor, and a 500-character message after trim, pass', async () => {
    const turns = Array.from({ length: 19 }, (_, i) => (i % 2 === 0 ? user(`hỏi ${i}`) : assistant(`đáp ${i}`)));
    await post({ messages: turns }).expect(200);
    await post({ messages: [user(`  ${'a'.repeat(500)}  `)], roomId: 101 }).expect(200);
    expect((toolRunner.mock.calls[1] as unknown as [{ messages: { content: string }[] }])[0].messages[0].content).toHaveLength(500);
  });

  it.each([
    ['no messages', { messages: [] }, 'messages'],
    ['21 messages', { messages: Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? user('a') : assistant('b'))) }, 'messages'],
    ['two user messages in a row', { messages: [user('a'), user('b'), user('c')] }, 'messages'],
    ['ends with assistant', { messages: [user('a'), assistant('b')] }, 'messages'],
    ['unknown role', { messages: [{ role: 'system', content: 'a' }] }, 'messages.0.role'],
    ['empty content', { messages: [user('')] }, 'messages.0.content'],
    ['only spaces', { messages: [user('    ')] }, 'messages.0.content'],
    ['501 characters', { messages: [user('a'.repeat(501))] }, 'messages.0.content'],
    ['roomId 0', { messages: [user('a')], roomId: 0 }, 'roomId'],
    ['roomId -1', { messages: [user('a')], roomId: -1 }, 'roomId'],
    ['roomId text', { messages: [user('a')], roomId: 'x' }, 'roomId'],
    ['roomId over Int', { messages: [user('a')], roomId: 2147483648 }, 'roomId'],
    ['unknown field', { messages: [user('a')], phone: '0912345678' }, 'phone'],
    ['unknown nested field', { messages: [{ role: 'user', content: 'a', name: 'An' }] }, 'messages.0.name'],
  ])('CHAT-01: %s -> 400 VALIDATION_FAILED, the provider is not called', async (_label, body, field) => {
    const res = await post(body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields)).toContain(field);
    expect(toolRunner).not.toHaveBeenCalled();
  });

  it('LOC-02: chat validation messages are English with Accept-Language: en', async () => {
    const res = await post({ messages: [user('a'.repeat(501))] }, 'en').expect(400);
    expect(res.body.error.fields['messages.0.content']).toBe('A message must have 1 to 500 characters');
  });

  it('CHAT-06: a provider failure -> 503 CHAT_UNAVAILABLE without the provider text; English with Accept-Language: en, Vietnamese for fr', async () => {
    toolRunner.mockRejectedValue(new Error('529 overloaded_error from api.anthropic.com'));
    const vn = await post({ messages: [user('a')] }, 'fr').expect(503);
    expect(vn.body.error).toEqual({ code: 'CHAT_UNAVAILABLE', message: 'Trợ lý đang bận, vui lòng thử lại sau' });
    const en = await post({ messages: [user('a')] }, 'en').expect(503);
    expect(en.body.error).toEqual({ code: 'CHAT_UNAVAILABLE', message: ERRORS_EN.CHAT_UNAVAILABLE });
    expect(JSON.stringify([vn.body, en.body])).not.toContain('overloaded');
  });

  it('CHAT-06: the app boots without a key and answers CHAT_UNAVAILABLE', async () => {
    const noKey = await boot(null);
    try {
      const res = await request(noKey.getHttpServer()).post('/api/v1/public/chat').send({ messages: [user('a')] }).expect(503);
      expect(res.body.error.code).toBe('CHAT_UNAVAILABLE');
    } finally { await noKey.close(); }
  });

  it('CHAT-07: a successful chat touches no database table (an empty Prisma fake would 500 on any write or audit row)', async () => {
    const withDb = await boot({ beta: { messages: { toolRunner } } }, {});
    try {
      await request(withDb.getHttpServer()).post('/api/v1/public/chat').send({ messages: [user('a')] }).expect(200);
    } finally { await withDb.close(); }
  });
});
