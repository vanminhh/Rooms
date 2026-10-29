import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  INestApplication,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import request from 'supertest';
import { configureApp } from './app.setup.js';
import { ERRORS, ErrorCode } from './common/errors/error-code.js';

// No Prisma and no AppModule here: a controller that exists only in this test is
// mounted on a real Nest HTTP app (real pipe, filter, interceptor, cookie parser).
// Only the Nest Logger is replaced (an outside edge: it would print to the console).

class ItemDto {
  @IsInt({ message: 'Giá trị phải là số nguyên' })
  value: number;
}

class AddressDto {
  @IsString({ message: 'Đường không hợp lệ' })
  street: string;
}

class PhoneDto {
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;
}

class NestedDto {
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items?: ItemDto[];
}

class TwoRulesDto {
  @IsString({ message: 'Phải là chuỗi' })
  @MinLength(5, { message: 'Phải có ít nhất 5 ký tự' })
  name: string;
}

class NoteDto {
  @IsString({ message: 'Ghi chú không hợp lệ' })
  note: string;
}

const handlerCalls: unknown[] = [];

// D8: errors that look like http-errors (what body-parser throws) but are thrown by a test route.
// Every message is "raw-<name>", so any leak into a response is easy to spot.
const d8Props: Record<string, Record<string, unknown>> = {
  e400: { status: 400, expose: true },
  e401: { status: 401, expose: true },
  e403: { status: 403, expose: true },
  e404: { status: 404, expose: true },
  e409: { status: 409, expose: true },
  e413: { status: 413, expose: true },
  e415: { status: 415, expose: true },
  e422: { status: 422, expose: true },
  e429: { status: 429, expose: true },
  e499: { status: 499, expose: true },
  s500: { status: 500, expose: true },
  s503: { status: 503, expose: true },
  s399: { status: 399, expose: true },
  s0: { status: 0, expose: true },
  sNaN: { status: Number.NaN, expose: true },
  exposeFalse: { status: 413, expose: false },
  noExpose: { status: 413 },
  exposeString: { status: 413, expose: 'true' },
  exposeOne: { status: 413, expose: 1 },
  statusString: { status: '413', expose: true },
  statusCodeOnly: { statusCode: 413, expose: true },
  onlyExpose: { expose: true },
};

const throwers: Record<string, () => never> = {
  conflict: () => {
    throw new ConflictException(ErrorCode.PHONE_TAKEN);
  },
  badRequestWithConflictCode: () => {
    throw new BadRequestException(ErrorCode.PHONE_TAKEN);
  },
  unauthorized: () => {
    throw new UnauthorizedException();
  },
  forbidden: () => {
    throw new ForbiddenException();
  },
  notFound: () => {
    throw new NotFoundException('x');
  },
  http409: () => {
    throw new HttpException('x', 409);
  },
  http429: () => {
    throw new HttpException('x', 429);
  },
  http413: () => {
    throw new HttpException('x', 413);
  },
  http503: () => {
    throw new HttpException('x', 503);
  },
  codeInBodyWithOtherStatus: () => {
    throw new HttpException({ code: ErrorCode.PHONE_TAKEN }, 500);
  },
  messageInObject: () => {
    throw new HttpException({ message: ErrorCode.CONFLICT_STATE }, 400);
  },
  messageArray: () => {
    throw new BadRequestException(['a must be a string', 'b must be a number']);
  },
  unknownCodeInBody: () => {
    throw new HttpException({ code: 'NOT_A_REAL_CODE' }, 409);
  },
  protoKeyMessage: () => {
    throw new HttpException('constructor', 409);
  },
  plainError: () => {
    throw new Error('password=SECRET123');
  },
  thrownString: () => {
    throw 'password=SECRET123';
  },
  thrownNull: () => {
    throw null;
  },
};

@Controller('t')
class TestController {
  @Get('ok')
  ok() {
    return { ok: true };
  }
  @Get('obj')
  obj() {
    return { id: 1, name: 'An' };
  }
  @Get('arr')
  arr() {
    return [1, 2, 3];
  }
  @Get('zero')
  zero() {
    return 0;
  }
  @Get('false')
  isFalse() {
    return false;
  }
  @Get('empty')
  empty() {
    return '';
  }
  @Get('undef')
  undef() {
    return undefined;
  }
  @Get('null')
  isNull() {
    return null;
  }
  @Get('cookie')
  cookie(@Req() req: Request) {
    return (req.cookies as Record<string, string>).rt;
  }
  @Get('throw/:name')
  thrown(@Param('name') name: string) {
    return throwers[name]();
  }
  @Get('async-throw')
  async asyncThrown() {
    await Promise.resolve();
    throw new ConflictException(ErrorCode.PHONE_TAKEN);
  }
  @Get('code/:code')
  code(@Param('code') code: string) {
    throw new BadRequestException(code);
  }
  @Get('d8/:name')
  d8(@Param('name') name: string) {
    throw Object.assign(new Error(`raw-${name}`), d8Props[name]);
  }
  @Get('d8-plain')
  d8Plain() {
    throw { status: 413, expose: true };
  }
  @Post('note')
  @HttpCode(200)
  note(@Body() dto: NoteDto) {
    handlerCalls.push(dto);
    return { length: dto.note.length };
  }
  // The plan's scenarios say "-> 200" for accepted bodies; Nest's default for POST is 201,
  // so the test routes pin 200 (a fixture detail, unrelated to the unit under test).
  @Post('phone')
  @HttpCode(200)
  phone(@Body() dto: PhoneDto) {
    handlerCalls.push(dto);
    return dto;
  }
  @Post('nested')
  @HttpCode(200)
  nested(@Body() dto: NestedDto) {
    handlerCalls.push(dto);
    return dto;
  }
  @Post('two-rules')
  @HttpCode(200)
  twoRules(@Body() dto: TwoRulesDto) {
    handlerCalls.push(dto);
    return dto;
  }
}

let app: INestApplication;
let loggerError: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [TestController],
  }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  handlerCalls.length = 0;
  loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const http = () => request(app.getHttpServer());

describe('API-01: prefix /api/v1, no CORS, cookie parser', () => {
  it('API-01: GET /api/v1/t/ok answers 200', async () => {
    const res = await http().get('/api/v1/t/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
  });

  it('API-01: the same route without the prefix is a 404 NOT_FOUND error body (no "Cannot GET")', async () => {
    const res = await http().get('/t/ok');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' },
    });
    expect(res.text).not.toContain('Cannot GET');
  });

  it('API-01: the error body is JSON', async () => {
    const res = await http().get('/api/v1/t/does-not-exist');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.status).toBe(404);
  });

  it('BE-LOGIN-07: CORS is off, a cross-origin GET gets no access-control-allow-origin', async () => {
    const res = await http()
      .get('/api/v1/t/ok')
      .set('Origin', 'http://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('BE-LOGIN-07: CORS is off, a preflight OPTIONS gets no access-control-allow-* header', async () => {
    const res = await http()
      .options('/api/v1/t/ok')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    const corsHeaders = Object.keys(res.headers).filter((h) =>
      h.startsWith('access-control-allow-'),
    );
    expect(corsHeaders).toEqual([]);
  });

  it('BE-LOGIN-07: cookie parser is on, req.cookies.rt is readable', async () => {
    const res = await http().get('/api/v1/t/cookie').set('Cookie', 'rt=abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: 'abc' });
  });

  it('BE-LOGIN-07: main.ts creates the app, then configureApp, then shutdown hooks, then listen', () => {
    const main = readFileSync(
      fileURLToPath(new URL('./main.ts', import.meta.url)),
      'utf8',
    );
    const order = [
      'validateEnv()',
      'NestFactory.create(AppModule)',
      'configureApp(app)',
      'app.enableShutdownHooks()',
      'app.listen(',
    ].map((needle) => main.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(main).not.toContain('enableCors');
  });
});

// D6: every path outside /api/v1 must answer with the API-03 JSON body, never Express's HTML 404.
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' },
};

describe('API-01 / API-03 + D6: prefix guard', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/t/ok'],
    ['POST', '/t/ok'],
    ['GET', '/api/v1x'],
    ['GET', '/api'],
    ['GET', '/api/'],
    ['GET', '/api/v2/t/ok'],
    ['GET', '/x/api/v1/t/ok'],
    ['GET', '/api/v1x/t/ok'],
    ['GET', '/t/ok?a=1'],
    ['GET', '/api/v1x?a=1'],
    ['DELETE', '/api/v1x'],
    ['PUT', '/anything'],
  ])('D6: %s %s -> 404 NOT_FOUND JSON body, no HTML', async (method, path) => {
    const res = await request(app.getHttpServer())[
      method.toLowerCase() as 'get' | 'post' | 'delete' | 'put'
    ](path);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(res.text).not.toMatch(/<html/i);
    expect(res.text).not.toContain('Cannot GET');
    expect(res.text).not.toContain('Cannot POST');
    expect(res.text).not.toContain('Cannot DELETE');
    expect(res.text).not.toContain('Cannot PUT');
  });

  it('D6: POST with a JSON body outside the prefix is also the NOT_FOUND body and the handler does not run', async () => {
    const res = await http().post('/t/phone').send({ phone: '0912345678' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
    expect(handlerCalls).toEqual([]);
  });

  it('D6: a broken JSON body outside the prefix is still 404 NOT_FOUND (not 400)', async () => {
    const res = await http()
      .post('/t/phone')
      .set('Content-Type', 'application/json')
      .send('{"phone":');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND_BODY);
  });

  it.each(['/api/v1', '/api/v1/', '/api/v1/khong-co', '/api/v1?a=1'])(
    'D6: GET %s passes the guard, Nest has no route there -> same NOT_FOUND body',
    async (path) => {
      const res = await http().get(path);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual(NOT_FOUND_BODY);
      expect(res.text).not.toMatch(/<html|Cannot GET/i);
    },
  );

  it('D6: the guard does not block a real route, with or without a query string', async () => {
    const plain = await http().get('/api/v1/t/ok');
    expect(plain.status).toBe(200);
    expect(plain.body).toEqual({ data: { ok: true } });
    const withQuery = await http().get('/api/v1/t/ok?a=1');
    expect(withQuery.status).toBe(200);
    expect(withQuery.body).toEqual({ data: { ok: true } });
  });

  it('D6: the guard does not block a real POST route under the prefix (valid body -> 200, invalid -> 400)', async () => {
    const ok = await http().post('/api/v1/t/phone?x=1').send({ phone: '0912345678' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ data: { phone: '0912345678' } });
    const bad = await http().post('/api/v1/t/phone?x=1').send({});
    expect(bad.status).toBe(400);
  });

  it('D6: a cookie still reaches the handler under the prefix (guard runs before cookie parser without breaking it)', async () => {
    const res = await http().get('/api/v1/t/cookie?a=1').set('Cookie', 'rt=abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: 'abc' });
  });

  it('D6: CORS is still off on a 404 outside the prefix', async () => {
    const res = await http().get('/').set('Origin', 'http://evil.example');
    expect(res.status).toBe(404);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('D6: a 404 outside the prefix is not logged as a server error', async () => {
    await http().get('/nope');
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('API-02: success body is { data }', () => {
  it('API-02: an object becomes exactly { data: object } with no other top-level key', async () => {
    const res = await http().get('/api/v1/t/obj');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 1, name: 'An' } });
    expect(Object.keys(res.body as object)).toEqual(['data']);
  });

  it('API-02: an array becomes { data: [...] }', async () => {
    const res = await http().get('/api/v1/t/arr');
    expect(res.body).toEqual({ data: [1, 2, 3] });
  });

  it.each([
    ['zero', 0],
    ['false', false],
    ['empty', ''],
  ])('API-02: falsy value %s is kept inside data', async (route, value) => {
    const res = await http().get(`/api/v1/t/${route}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: value });
  });

  it('API-02: undefined becomes { data: null }', async () => {
    const res = await http().get('/api/v1/t/undef');
    expect(res.body).toEqual({ data: null });
  });

  it('API-02: null stays { data: null }', async () => {
    const res = await http().get('/api/v1/t/null');
    expect(res.body).toEqual({ data: null });
  });
});

describe('API-03 / API-04: error body and HTTP status', () => {
  it('API-03: ConflictException(ErrorCode.PHONE_TAKEN) renders the error body with 409', async () => {
    const res = await http().get('/api/v1/t/throw/conflict');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'PHONE_TAKEN',
        message: 'Số điện thoại đã được sử dụng',
      },
    });
    expect(res.text).not.toContain('statusCode');
    expect(res.text).not.toContain('stack');
  });

  it('API-03: an async handler that rejects renders the same error body', async () => {
    const res = await http().get('/api/v1/t/async-throw');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'PHONE_TAKEN',
        message: 'Số điện thoại đã được sử dụng',
      },
    });
  });

  it('API-03: validation failure renders VALIDATION_FAILED with fields', async () => {
    const res = await http().post('/api/v1/t/phone').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { phone: 'Số điện thoại không hợp lệ' },
      },
    });
    expect(handlerCalls).toEqual([]);
  });

  it.each([
    ['0912345678', 200],
    ['091234567', 400],
    ['09123456789', 400],
    ['1912345678', 400],
    ['', 400],
    ['09123456 7', 400],
  ])('G-04: phone %j -> %i', async (phone, status) => {
    const res = await http().post('/api/v1/t/phone').send({ phone });
    expect(res.status).toBe(status);
    if (status === 400) {
      expect(res.body).toEqual({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Dữ liệu không hợp lệ',
          fields: { phone: 'Số điện thoại không hợp lệ' },
        },
      });
    } else {
      expect(res.body).toEqual({ data: { phone } });
    }
  });

  it.each([[912345678], [null], [true], [['0912345678']]])(
    'G-04: a non-string phone %j is rejected with fields.phone',
    async (phone) => {
      const res = await http().post('/api/v1/t/phone').send({ phone });
      expect(res.status).toBe(400);
      expect((res.body as { error: { fields: object } }).error.fields).toHaveProperty(
        'phone',
      );
      expect(handlerCalls).toEqual([]);
    },
  );

  it('BE-LOGIN-07: whitelist + forbid, an undeclared property is rejected and the handler does not run', async () => {
    const res = await http()
      .post('/api/v1/t/phone')
      .send({ phone: '0912345678', role: 'BOSS' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { role: 'Trường này không được phép gửi lên' },
      },
    });
    expect(handlerCalls).toEqual([]);
  });

  it('BE-LOGIN-07: a valid body reaches the handler with exactly the DTO keys', async () => {
    const res = await http().post('/api/v1/t/phone').send({ phone: '0912345678' });
    expect(res.status).toBe(200);
    expect(handlerCalls).toHaveLength(1);
    expect(Object.keys(handlerCalls[0] as object)).toEqual(['phone']);
    expect(res.body).toEqual({ data: { phone: '0912345678' } });
  });

  it('API-03: several rule violations on one field give one string message, one of the declared messages', async () => {
    const res = await http().post('/api/v1/t/two-rules').send({ name: 12 });
    expect(res.status).toBe(400);
    const name = (res.body as { error: { fields: { name: unknown } } }).error.fields.name;
    expect(typeof name).toBe('string');
    expect(['Phải là chuỗi', 'Phải có ít nhất 5 ký tự']).toContain(name);
  });

  it('API-03: nested errors use dotted paths (address.street, items.0.value, items.1.value)', async () => {
    const res = await http()
      .post('/api/v1/t/nested')
      .send({
        phone: '0912345678',
        address: { street: 5 },
        items: [{ value: 'a' }, { value: 1 }, { value: 1.5 }],
      });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: {
          'address.street': 'Đường không hợp lệ',
          'items.0.value': 'Giá trị phải là số nguyên',
          'items.2.value': 'Giá trị phải là số nguyên',
        },
      },
    });
  });

  it('API-03: an undeclared property inside a nested object is forbidden with a dotted path', async () => {
    const res = await http()
      .post('/api/v1/t/nested')
      .send({ phone: '0912345678', address: { street: 'x', extra: 1 } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { 'address.extra': 'Trường này không được phép gửi lên' },
      },
    });
  });

  it('API-03: a valid nested body passes', async () => {
    const res = await http()
      .post('/api/v1/t/nested')
      .send({
        phone: '0912345678',
        address: { street: 'Xuân Thủy' },
        items: [{ value: 1 }],
      });
    expect(res.status).toBe(200);
  });

  it('API-03 / API-04: a broken JSON body is 400 VALIDATION_FAILED and does not leak the SyntaxError text', async () => {
    const res = await http()
      .post('/api/v1/t/phone')
      .set('Content-Type', 'application/json')
      .send('{"phone":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' },
    });
    expect(res.text).not.toMatch(/JSON|Unexpected|SyntaxError|position/i);
  });

  it.each([
    ['unauthorized', 401, 'UNAUTHENTICATED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['notFound', 404, 'NOT_FOUND'],
    ['http409', 409, 'CONFLICT_STATE'],
    ['http429', 429, 'TOO_MANY_REQUESTS'],
    ['http413', 400, 'VALIDATION_FAILED'],
  ])('API-04: exception %s -> %i %s by HTTP status', async (name, status, code) => {
    const res = await http().get(`/api/v1/t/throw/${name}`);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({
      error: {
        code,
        message: ERRORS[code as ErrorCode].message,
      },
    });
  });

  it('API-04: the HTTP status comes from the error code, not from the exception (BadRequestException(PHONE_TAKEN) -> 409)', async () => {
    const res = await http().get('/api/v1/t/throw/badRequestWithConflictCode');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'PHONE_TAKEN',
        message: 'Số điện thoại đã được sử dụng',
      },
    });
  });

  it('API-04: a { code } body wins over an unrelated exception status (HttpException({code: PHONE_TAKEN}, 500) -> 409)', async () => {
    const res = await http().get('/api/v1/t/throw/codeInBodyWithOtherStatus');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'PHONE_TAKEN',
        message: 'Số điện thoại đã được sử dụng',
      },
    });
  });

  it('API-04: response.message equal to an ErrorCode is used (HttpException({message: CONFLICT_STATE}, 400) -> 409)', async () => {
    const res = await http().get('/api/v1/t/throw/messageInObject');
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('CONFLICT_STATE');
  });

  it('API-04: an array message (Nest style) falls back to the status -> 400 VALIDATION_FAILED without fields', async () => {
    const res = await http().get('/api/v1/t/throw/messageArray');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' },
    });
  });

  it('API-04: a { code } that is not a known ErrorCode is ignored and the status decides (409 -> CONFLICT_STATE)', async () => {
    const res = await http().get('/api/v1/t/throw/unknownCodeInBody');
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('CONFLICT_STATE');
  });

  it('API-04: a message that is an Object.prototype key ("constructor") is not mistaken for an ErrorCode', async () => {
    const res = await http().get('/api/v1/t/throw/protoKeyMessage');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'CONFLICT_STATE',
        message: 'Thao tác không hợp lệ ở trạng thái hiện tại',
      },
    });
  });

  it('API-04: unexpected Error -> 500 INTERNAL_ERROR, no raw message, no stack, raw error goes to the server log', async () => {
    const res = await http().get('/api/v1/t/throw/plainError');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Có lỗi xảy ra, vui lòng thử lại sau',
      },
    });
    expect(res.text).not.toContain('SECRET123');
    expect(res.text).not.toContain('stack');
    expect(loggerError).toHaveBeenCalled();
    expect(String(loggerError.mock.calls[0][0])).toContain('SECRET123');
  });

  it.each(['thrownString', 'thrownNull'])(
    'API-04: a non-Error value thrown (%s) -> 500 INTERNAL_ERROR without leaking it',
    async (name) => {
      const res = await http().get(`/api/v1/t/throw/${name}`);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Có lỗi xảy ra, vui lòng thử lại sau',
        },
      });
      expect(res.text).not.toContain('SECRET123');
    },
  );

  it('API-04: HttpException("x", 503) -> 500 INTERNAL_ERROR (status taken from the table, 503 is not kept)', async () => {
    const res = await http().get('/api/v1/t/throw/http503');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Có lỗi xảy ra, vui lòng thử lại sau',
      },
    });
  });

  it('API-03: only expected keys appear in the error object (no fields unless validation)', async () => {
    const res = await http().get('/api/v1/t/throw/forbidden');
    const body = res.body as { error: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(['error']);
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
  });
});

// Expected values come from docs/spec/01-architecture.md#error-codes, AUTH-01, AUTH-02
// and decision D4 (INTERNAL_ERROR), not from the code under test.
const EXPECTED: [string, number, string][] = [
  ['VALIDATION_FAILED', 400, 'Dữ liệu không hợp lệ'],
  ['UNAUTHENTICATED', 401, 'Bạn cần đăng nhập để tiếp tục'],
  ['PASSWORD_CHANGE_REQUIRED', 403, 'Bạn cần đổi mật khẩu trước khi tiếp tục'],
  ['FORBIDDEN', 403, 'Bạn không có quyền thực hiện thao tác này'],
  ['OUT_OF_SCOPE', 403, 'Dữ liệu này nằm ngoài phạm vi của bạn'],
  ['NOT_FOUND', 404, 'Không tìm thấy dữ liệu'],
  ['CONFLICT_STATE', 409, 'Thao tác không hợp lệ ở trạng thái hiện tại'],
  ['TOO_MANY_REQUESTS', 429, 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau'],
  ['PHONE_TAKEN', 409, 'Số điện thoại đã được sử dụng'],
  ['MANAGER_MAX_2_BUILDINGS', 409, 'Mỗi quản lý chỉ phụ trách tối đa 2 tòa'],
  ['ROOM_NOT_AVAILABLE', 409, 'Phòng không còn trống'],
  ['CONTRACT_TERM_TOO_SHORT', 400, 'Thời hạn hợp đồng tối thiểu 3 tháng'],
  ['DEPOSIT_NOT_PAID', 409, 'Hóa đơn cọc chưa được thanh toán'],
  ['INVOICE_NOT_UNPAID', 409, 'Hóa đơn không ở trạng thái chờ thanh toán'],
  ['PAYMENT_AMOUNT_MISMATCH', 409, 'Số tiền thanh toán không khớp tổng hóa đơn'],
  ['METER_VALUE_DECREASED', 400, 'Chỉ số mới nhỏ hơn chỉ số trước'],
  ['PRICE_NOT_APPROVED', 409, 'Phòng chưa có giá được duyệt'],
  ['RATE_PLAN_MISSING', 409, 'Chưa có đơn giá được duyệt cho kỳ này'],
  ['PENDING_REQUEST_EXISTS', 409, 'Đã có yêu cầu đang chờ xử lý'],
  ['WEBHOOK_SIGNATURE_INVALID', 401, 'Chữ ký webhook không hợp lệ'],
  ['INVALID_CREDENTIALS', 401, 'Số điện thoại hoặc mật khẩu không đúng'],
  ['ACCOUNT_LOCKED', 403, 'Tài khoản đã bị khóa. Liên hệ quản lý.'],
  ['INTERNAL_ERROR', 500, 'Có lỗi xảy ra, vui lòng thử lại sau'],
];

describe('01-architecture#error-codes: ErrorCode and ERRORS table', () => {
  it('01-architecture: ErrorCode has exactly 23 members (20 spec codes + INVALID_CREDENTIALS + ACCOUNT_LOCKED + INTERNAL_ERROR), value = name', () => {
    const members = Object.entries(ErrorCode);
    expect(members).toHaveLength(23);
    expect(members.every(([k, v]) => k === v)).toBe(true);
    expect(Object.keys(ErrorCode).sort()).toEqual(EXPECTED.map((e) => e[0]).sort());
  });

  it('01-architecture: ERRORS has an entry for each code, with the status of the spec table', () => {
    expect(Object.keys(ERRORS).sort()).toEqual(EXPECTED.map((e) => e[0]).sort());
    for (const [code, status] of EXPECTED) {
      expect(ERRORS[code as ErrorCode].status, code).toBe(status);
    }
  });

  it('AUTH-01: ERRORS.INVALID_CREDENTIALS is 401 with the exact wording', () => {
    expect(ERRORS.INVALID_CREDENTIALS).toEqual({
      status: 401,
      message: 'Số điện thoại hoặc mật khẩu không đúng',
    });
  });

  it('AUTH-02: ERRORS.ACCOUNT_LOCKED is 403 with the exact wording', () => {
    expect(ERRORS.ACCOUNT_LOCKED).toEqual({
      status: 403,
      message: 'Tài khoản đã bị khóa. Liên hệ quản lý.',
    });
  });

  it('API-03: every message is non-empty and is not just the code name', () => {
    for (const [code, entry] of Object.entries(ERRORS)) {
      expect(entry.message.trim().length, code).toBeGreaterThan(0);
      expect(entry.message, code).not.toBe(code);
    }
  });

  it.each(EXPECTED)(
    'API-04: throwing the code %s over HTTP gives status %i and the planned Vietnamese message',
    async (code, status, message) => {
      const res = await http().get(`/api/v1/t/code/${code}`);
      expect(res.status).toBe(status);
      expect(res.body).toEqual({ error: { code, message } });
    },
  );
});

// D8: body-parser errors (http-errors) reach the filter through the real app.
// Expected bodies come from the plan (D8 + API-03/04), not from the filter code.
const VALIDATION_BODY = {
  error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' },
};
const INTERNAL_BODY = {
  error: { code: 'INTERNAL_ERROR', message: 'Có lỗi xảy ra, vui lòng thử lại sau' },
};
const BODY_PARSER_LIMIT = 102_400; // 100 kB, the default JSON limit of body-parser (plan D8)

// A JSON body of exactly `bytes` bytes: { phone, pad } with the padding sized to fit.
const phoneBodyOfSize = (bytes: number): string => {
  const empty = JSON.stringify({ phone: '0912345678', pad: '' });
  const body = JSON.stringify({
    phone: '0912345678',
    pad: 'a'.repeat(bytes - Buffer.byteLength(empty)),
  });
  expect(Buffer.byteLength(body)).toBe(bytes);
  return body;
};

const postJson = (path: string, raw: string) =>
  http().post(path).set('Content-Type', 'application/json').send(raw);

describe('API-03 / API-04 + D8: body-parser client errors through the real app', () => {
  it('D8: a JSON body of 110 000 bytes (413 entity.too.large) -> 400 VALIDATION_FAILED, no fields, no leak, not logged', async () => {
    const res = await postJson(
      '/api/v1/t/phone',
      JSON.stringify({ phone: '0912345678', pad: 'a'.repeat(110_000) }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(res.text).not.toMatch(/too large|entity\.too\.large|INTERNAL_ERROR/i);
    expect(res.text).not.toContain('fields');
    expect(handlerCalls).toEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: an oversize body to a route with a valid DTO (note) is also 400 VALIDATION_FAILED and the handler does not run', async () => {
    const res = await postJson(
      '/api/v1/t/note',
      JSON.stringify({ note: 'a'.repeat(120_000) }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(handlerCalls).toEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: a body of ~100 000 bytes (under the 100 kB limit) gets past body-parser and reaches the ValidationPipe (fields.pad)', async () => {
    const res = await postJson('/api/v1/t/phone', phoneBodyOfSize(100_000));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { pad: 'Trường này không được phép gửi lên' },
      },
    });
    expect(handlerCalls).toEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: a valid body of ~100 000 bytes reaches the handler and is answered 200 { data }', async () => {
    const note = 'a'.repeat(99_900);
    const raw = JSON.stringify({ note });
    expect(Buffer.byteLength(raw)).toBeLessThan(BODY_PARSER_LIMIT);
    expect(Buffer.byteLength(raw)).toBeGreaterThan(99_000);
    const res = await postJson('/api/v1/t/note', raw);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { length: 99_900 } });
    expect(handlerCalls).toHaveLength(1);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8 boundary: exactly 102 400 bytes (the limit) still passes body-parser -> ValidationPipe fields.pad', async () => {
    const res = await postJson('/api/v1/t/phone', phoneBodyOfSize(BODY_PARSER_LIMIT));
    expect(res.status).toBe(400);
    expect((res.body as { error: { fields: object } }).error.fields).toEqual({
      pad: 'Trường này không được phép gửi lên',
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8 boundary: 102 401 bytes (one over the limit) -> 413 mapped to 400 VALIDATION_FAILED without fields', async () => {
    const res = await postJson('/api/v1/t/phone', phoneBodyOfSize(BODY_PARSER_LIMIT + 1));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: Content-Type charset=latin1 (415 charset.unsupported) -> 400 VALIDATION_FAILED, no leak, not logged', async () => {
    const res = await http()
      .post('/api/v1/t/phone')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"phone":"0912345678"}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(res.text).not.toMatch(/unsupported charset|charset\.unsupported|INTERNAL_ERROR/i);
    expect(handlerCalls).toEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: the same body with charset=utf-8 is fine (the 415 mapping does not catch a supported charset)', async () => {
    const res = await http()
      .post('/api/v1/t/phone')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send('{"phone":"0912345678"}');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { phone: '0912345678' } });
  });

  it('D8: Content-Encoding foo (415 encoding.unsupported) -> 400 VALIDATION_FAILED, no leak, not logged', async () => {
    const res = await http()
      .post('/api/v1/t/phone')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'foo')
      .send('{"phone":"0912345678"}');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(res.text).not.toMatch(/unsupported content encoding|encoding\.unsupported|INTERNAL_ERROR/i);
    expect(handlerCalls).toEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: a broken JSON body is still 400 VALIDATION_FAILED and still not logged (SyntaxError path unchanged)', async () => {
    const res = await postJson('/api/v1/t/phone', '{"phone":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('API-04 + D8: http-errors look-alike mapped by status (4xx with expose === true)', () => {
  it.each([
    ['e413', 400, 'VALIDATION_FAILED'],
    ['e415', 400, 'VALIDATION_FAILED'],
    ['e400', 400, 'VALIDATION_FAILED'],
    ['e422', 400, 'VALIDATION_FAILED'],
    ['e499', 400, 'VALIDATION_FAILED'],
    ['e401', 401, 'UNAUTHENTICATED'],
    ['e403', 403, 'FORBIDDEN'],
    ['e404', 404, 'NOT_FOUND'],
    ['e409', 409, 'CONFLICT_STATE'],
    ['e429', 429, 'TOO_MANY_REQUESTS'],
  ])('D8: thrown { %s } -> %i %s, no raw message, no stack, not logged', async (name, status, code) => {
    const res = await http().get(`/api/v1/t/d8/${name}`);
    expect(res.status).toBe(status);
    expect(res.body).toEqual({
      error: { code, message: ERRORS[code as ErrorCode].message },
    });
    expect(res.text).not.toContain(`raw-${name}`);
    expect(res.text).not.toContain('stack');
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('D8: a plain object (not an Error) { status: 413, expose: true } is mapped the same -> 400 VALIDATION_FAILED, not logged', async () => {
    const res = await http().get('/api/v1/t/d8-plain');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION_BODY);
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe('API-04 + D4 + D8: everything else stays 500 INTERNAL_ERROR and is logged', () => {
  it.each([
    ['s500', '{ status: 500, expose: true }'],
    ['s503', '{ status: 503, expose: true } (same as a 5xx)'],
    ['s399', '{ status: 399, expose: true } (below 400)'],
    ['s0', '{ status: 0, expose: true }'],
    ['sNaN', '{ status: NaN, expose: true }'],
    ['exposeFalse', '{ status: 413, expose: false }'],
    ['noExpose', '{ status: 413 } (no expose)'],
    ['exposeString', "{ status: 413, expose: 'true' } (expose is not === true)"],
    ['exposeOne', '{ status: 413, expose: 1 } (expose is not === true)'],
    ['statusString', "{ status: '413', expose: true } (status is a string)"],
    ['statusCodeOnly', '{ statusCode: 413, expose: true } (no status)'],
    ['onlyExpose', '{ expose: true } (no status at all)'],
  ])('D8: thrown %s %s -> 500 INTERNAL_ERROR, raw message hidden, logged once', async (name) => {
    const res = await http().get(`/api/v1/t/d8/${name}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
    expect(res.text).not.toContain(`raw-${name}`);
    expect(res.text).not.toContain('stack');
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(String(loggerError.mock.calls[0][0])).toContain(`raw-${name}`);
  });

  it('D8: a plain Error without status/expose is still 500 INTERNAL_ERROR and logged once (no regression)', async () => {
    const res = await http().get('/api/v1/t/throw/plainError');
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
    expect(loggerError).toHaveBeenCalledTimes(1);
  });
});
