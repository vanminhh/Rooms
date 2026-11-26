import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ErrorCode } from '../../common/errors/error-code.js';
import { Paginated } from '../../common/pagination.js';
import type { PublicBuildingsService } from '../buildings/public-buildings.service.js';
import type { PublicRoomsService } from '../rooms/public-rooms.service.js';
import { CHAT_INSTRUCTIONS } from './chat-prompt.js';
import { CHAT_SEARCH_MAX, CHAT_TOOL_NAMES, LOOKUP_FAILED_TEXT, NOT_FOUND_TEXT, chatTools } from './chat-tools.js';
import { CHAT_MAX_ITERATIONS, CHAT_MODEL, ChatbotService } from './chatbot.service.js';
import type { ChatRequestDto } from './dto/chat.dto.js';

// Unit under test: ChatbotService + chatTools. Only the Anthropic client (external provider) is faked;
// the public services are stubbed edges, their own public filters are tested in rooms/buildings specs.

const LIST_ITEM = {
  id: 101, code: 'A101', floor: 1, areaM2: 30, price: 3_000_000, maxOccupants: 2, buildingId: 10, buildingCode: 'DD01',
  buildingName: 'Dương Đình 1', district: 'Cầu Giấy', ward: 'Dịch Vọng', imageUrl: 'https://img/101.jpg', roomType: 'STUDIO',
  hasBalcony: true, hasWindow: true, petsAllowed: false, buildingAmenities: ['PARKING'],
};
const ROOM_DETAIL = {
  ...LIST_ITEM, furniture: [], description: null, deposit: 3_000_000, monthlyEstimate: 3_250_000,
  estimate: { items: [], missing: [], meteredNote: '' }, images: [{ id: 1, url: 'https://img/101.jpg', sortOrder: 0 }],
  building: { id: 10 }, rates: { electric: null, water: null, services: [] }, upcomingRates: [],
  contact: { phone: '0912345678', zaloUrl: null, facebookUrl: null },
};

function stubs() {
  const rooms = {
    list: vi.fn(async () => new Paginated([LIST_ITEM], { page: 1, limit: 5, total: 1 })),
    detail: vi.fn(async () => ROOM_DETAIL),
  };
  const buildings = {
    locations: vi.fn(async () => [{ district: 'Cầu Giấy', roomCount: 1, wards: [{ ward: 'Dịch Vọng', roomCount: 1 }] }]),
    detail: vi.fn(async () => ({ id: 10, name: 'Dương Đình 1', contact: ROOM_DETAIL.contact, rooms: [LIST_ITEM] })),
  };
  return { rooms, buildings, r: rooms as unknown as PublicRoomsService, b: buildings as unknown as PublicBuildingsService };
}

const message = (overrides: Record<string, unknown> = {}) => ({
  stop_reason: 'end_turn', content: [{ type: 'text', text: 'Phòng A101 giá 3.000.000 đ.' }], ...overrides,
});
function fakeClient(result: unknown) {
  const toolRunner = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
  return { toolRunner, client: { beta: { messages: { toolRunner } } } as unknown as Anthropic };
}
const ask = (text = 'Phòng dưới 4 triệu ở Cầu Giấy?', roomId?: number): ChatRequestDto =>
  ({ messages: [{ role: 'user', content: text }], ...(roomId === undefined ? {} : { roomId }) });

async function expectError(p: Promise<unknown>, status: number, code: ErrorCode) {
  const error = await p.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect(JSON.stringify((error as HttpException).getResponse())).toContain(code);
}

describe('ChatbotService (CHAT-01..07)', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('CHAT-02: calls Claude Haiku 5.5 with the 4 read-only tools, a 4-call budget, a timeout and the whole conversation', async () => {
    const { r, b } = stubs();
    const { client, toolRunner } = fakeClient(message());
    const service = new ChatbotService(client, r, b);
    const dto: ChatRequestDto = { messages: [
      { role: 'user', content: 'Chào' }, { role: 'assistant', content: 'Chào bạn' }, { role: 'user', content: 'Phòng rẻ nhất?' },
    ] };
    await expect(service.reply(dto, '1.1.1.1', 'vi')).resolves.toEqual({ reply: 'Phòng A101 giá 3.000.000 đ.' });
    const [params, options] = toolRunner.mock.calls[0] as unknown as [Record<string, unknown>, { signal: AbortSignal }];
    expect(CHAT_MODEL).toBe('claude-haiku-5-5');
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.max_iterations).toBe(CHAT_MAX_ITERATIONS);
    expect(CHAT_MAX_ITERATIONS).toBe(4); // owner 26/11/2026: 4 calls / 15 s
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect((params.tools as { name: string }[]).map((t) => t.name)).toEqual([...CHAT_TOOL_NAMES]);
    expect(params.messages).toEqual(dto.messages);
  });

  it('CHAT-01/05: the room id of the page goes into the system prompt; the frozen instructions stay first and cacheable', async () => {
    const { r, b } = stubs();
    const { client, toolRunner } = fakeClient(message());
    await new ChatbotService(client, r, b).reply(ask('Phòng này bao nhiêu?', 101), '1.1.1.2', 'vi');
    const system = (toolRunner.mock.calls[0] as unknown as [{ system: { text: string; cache_control?: unknown }[] }])[0].system;
    expect(system[0]).toEqual({ type: 'text', text: CHAT_INSTRUCTIONS, cache_control: { type: 'ephemeral' } });
    expect(system[1].text).toContain('room id 101');
  });

  it('CHAT-04/05: the frozen instructions carry the scope, no-invention, money, language and handoff rules', () => {
    for (const rule of ['Only help people looking for a room', 'Never invent', '2.984.000 đ', '/phong/<room id>', 'contact phone',
      'Never ask for or collect', 'in English if the visitor writes in English, otherwise in Vietnamese']) {
      expect(CHAT_INSTRUCTIONS).toContain(rule);
    }
  });

  it('CHAT-06: no API key -> 503 CHAT_UNAVAILABLE', async () => {
    const { r, b } = stubs();
    await expectError(new ChatbotService(null, r, b).reply(ask(), '2.2.2.2', 'vi'), 503, ErrorCode.CHAT_UNAVAILABLE);
  });

  it('CHAT-06/07: a provider error -> CHAT_UNAVAILABLE; the log has the error name only, never the message text or provider text', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { r, b } = stubs();
    const { client } = fakeClient(new Error('401 invalid x-api-key sk-secret'));
    await expectError(new ChatbotService(client, r, b).reply(ask('Bí mật của tôi'), '2.2.2.3', 'vi'), 503, ErrorCode.CHAT_UNAVAILABLE);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('Bí mật');
    expect(logged).not.toContain('sk-secret');
  });

  it.each([
    ['refusal', message({ stop_reason: 'refusal', content: [] })],
    ['tool budget used up', message({ stop_reason: 'tool_use' })],
    ['empty text', message({ content: [{ type: 'text', text: '   ' }] })],
  ])('CHAT-06: %s -> CHAT_UNAVAILABLE', async (_label, result) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { r, b } = stubs();
    const { client } = fakeClient(result);
    await expectError(new ChatbotService(client, r, b).reply(ask(), '2.2.2.4', 'vi'), 503, ErrorCode.CHAT_UNAVAILABLE);
  });

  it('CHAT-03, A-29: 20 requests per IP per hour pass, the 21st is 429; another IP is not blocked; after one hour it resets', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T03:00:00Z'));
    const { r, b } = stubs();
    const { client, toolRunner } = fakeClient(message());
    const service = new ChatbotService(client, r, b);
    for (let i = 0; i < 20; i++) await service.reply(ask(), '3.3.3.3', 'vi');
    await expectError(service.reply(ask(), '3.3.3.3', 'vi'), 429, ErrorCode.TOO_MANY_REQUESTS);
    expect(toolRunner).toHaveBeenCalledTimes(20); // the blocked request never reaches the provider
    await expect(service.reply(ask(), '4.4.4.4', 'vi')).resolves.toBeDefined();
    vi.setSystemTime(new Date('2026-11-26T04:00:00.001Z'));
    await expect(service.reply(ask(), '3.3.3.3', 'vi')).resolves.toBeDefined();
  });

  it('CHAT-03: requests that fail with CHAT_UNAVAILABLE still count toward the limit (provider cost)', async () => {
    const { r, b } = stubs();
    const service = new ChatbotService(null, r, b);
    for (let i = 0; i < 20; i++) await expectError(service.reply(ask(), '5.5.5.5', 'vi'), 503, ErrorCode.CHAT_UNAVAILABLE);
    await expectError(service.reply(ask(), '5.5.5.5', 'vi'), 429, ErrorCode.TOO_MANY_REQUESTS);
  });
});

describe('chatTools (CHAT-02, PUB-01..04)', () => {
  const tool = (name: string, s = stubs()) => {
    const found = chatTools(s.r, s.b, 'vi').find((t) => t.name === name);
    if (!found) throw new Error(`missing tool ${name}`);
    return found as unknown as { run: (input: Record<string, unknown>) => Promise<string> };
  };

  it('CHAT-02: exactly four tools, all reads through the public services', () => {
    const s = stubs();
    expect(chatTools(s.r, s.b, 'vi').map((t) => t.name)).toEqual(['search_rooms', 'get_room', 'list_locations', 'get_building']);
  });

  it('CHAT-02/04: search_rooms passes price/district filters to PublicRoomsService.list and returns whole-đồng prices with the page link', async () => {
    const s = stubs();
    const out = JSON.parse(await tool('search_rooms', s).run({ district: 'Cầu Giấy', maxPrice: 4_000_000, balcony: true, window: false }));
    const query = s.rooms.list.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(query[0]).toMatchObject({ district: 'Cầu Giấy', maxPrice: 4_000_000, balcony: 'true', page: 1, limit: 5 });
    expect(query[0].window).toBeUndefined(); // false = no filter (PUB-06 "true only")
    expect(out).toEqual({ total: 1, rooms: [expect.objectContaining({ id: 101, price: 3_000_000, link: '/phong/101' })] });
    expect(Number.isInteger(out.rooms[0].price)).toBe(true);
    expect(out.rooms[0]).not.toHaveProperty('imageUrl');
  });

  it(`CHAT-02: search_rooms caps limit at ${CHAT_SEARCH_MAX}`, async () => {
    const s = stubs();
    await tool('search_rooms', s).run({ limit: 500 });
    expect((s.rooms.list.mock.calls[0] as unknown as [{ limit: number }])[0].limit).toBe(10);
  });

  it.each([
    [{ minPrice: -1 }, 'minPrice'],
    [{ amenities: ['SAUNA'] }, 'amenities'],
    [{ roomType: 'VILLA' }, 'roomType'],
    [{ ownerPhone: 'x' }, 'ownerPhone'],
  ])('CHAT-02: search_rooms with a bad filter %j answers text to the model and never queries', async (input, field) => {
    const s = stubs();
    const out = await tool('search_rooms', s).run(input);
    expect(out).toBe(`Invalid filter: ${field}.`);
    expect(s.rooms.list).not.toHaveBeenCalled();
  });

  it('ROOM-08, A-05, CHAT-05: get_room returns the monthly estimate and contact phone, without images', async () => {
    const s = stubs();
    const out = JSON.parse(await tool('get_room', s).run({ id: 101 }));
    expect(s.rooms.detail).toHaveBeenCalledWith(101, 'vi');
    expect(out).toMatchObject({ monthlyEstimate: 3_250_000, deposit: 3_000_000, contact: { phone: '0912345678' }, link: '/phong/101' });
    expect(out).not.toHaveProperty('images');
  });

  it('PUB-02: get_room gives the same "not found" for a hidden room and an invalid id; an invalid id never queries', async () => {
    const s = stubs();
    s.rooms.detail.mockRejectedValueOnce(new NotFoundException(ErrorCode.NOT_FOUND));
    expect(await tool('get_room', s).run({ id: 999 })).toBe(NOT_FOUND_TEXT);
    s.rooms.detail.mockClear();
    for (const id of [0, -1, 'x', 2147483648]) expect(await tool('get_room', s).run({ id })).toBe(NOT_FOUND_TEXT);
    expect(s.rooms.detail).not.toHaveBeenCalled();
  });

  it('CHAT-06: an unexpected service error goes to the model as a generic text, without the raw message', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const s = stubs();
    s.rooms.list.mockRejectedValueOnce(new Error('relation "rooms" does not exist'));
    expect(await tool('search_rooms', s).run({})).toBe(LOOKUP_FAILED_TEXT);
    vi.restoreAllMocks();
  });

  it('PUB-03/04: list_locations and get_building read PublicBuildingsService', async () => {
    const s = stubs();
    expect(JSON.parse(await tool('list_locations', s).run({}))).toEqual([{ district: 'Cầu Giấy', roomCount: 1, wards: [{ ward: 'Dịch Vọng', roomCount: 1 }] }]);
    const building = JSON.parse(await tool('get_building', s).run({ id: 10 }));
    expect(s.buildings.detail).toHaveBeenCalledWith(10);
    expect(building).toMatchObject({ contact: { phone: '0912345678' }, rooms: [{ id: 101, link: '/phong/101' }] });
  });
});
