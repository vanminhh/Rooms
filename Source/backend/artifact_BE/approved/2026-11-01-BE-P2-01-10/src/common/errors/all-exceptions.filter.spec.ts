import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { ErrorCode } from './error-code.js';

// Unit test of the filter itself: no real HTTP server, no DB. The only outside edges
// (the HTTP response object and the Logger) are faked/mocked; AllExceptionsFilter.catch
// and mapDbError (imported, not mocked) run for real.
function fakeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('BE-P2-01 / BE-P2-02: AllExceptionsFilter.catch, body per PLAN 2.2 scenario table', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario 1: P2002 users_phone_key -> 409 PHONE_TAKEN', () => {
    const { host, status, json } = fakeHost();
    filter.catch({ code: 'P2002', meta: { target: 'users_phone_key' } }, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'PHONE_TAKEN', message: 'Số điện thoại đã được sử dụng' },
    });
  });

  it('scenario 1: P2002 meta.target as array ["users_phone_key"] -> same 409 PHONE_TAKEN', () => {
    const { host, status, json } = fakeHost();
    filter.catch({ code: 'P2002', meta: { target: ['users_phone_key'] } }, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'PHONE_TAKEN', message: 'Số điện thoại đã được sử dụng' },
    });
  });

  it('scenario 2: P2002 rooms_building_id_code_key -> 400 VALIDATION_FAILED + fields.code', () => {
    const { host, status, json } = fakeHost();
    filter.catch({ code: 'P2002', meta: { target: 'rooms_building_id_code_key' } }, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
      },
    });
  });

  it.each([
    ['room_prices_one_pending', 'PRC-02'],
    ['rate_plans_one_pending', 'RATE-01'],
    ['rate_plans_one_per_day', 'D2-15'],
  ])('scenario 3-5 (%s, %s): P2002 unique violation -> 409 CONFLICT_STATE', (target) => {
    const { host, status, json } = fakeHost();
    filter.catch({ code: 'P2002', meta: { target } }, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT_STATE', message: 'Thao tác không hợp lệ ở trạng thái hiện tại' },
    });
  });

  it('scenario 6: trigger message MANAGER_MAX_2_BUILDINGS -> 409 with its own message (not CONFLICT_STATE)', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new Error('MANAGER_MAX_2_BUILDINGS: this manager already runs 2 buildings'), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'MANAGER_MAX_2_BUILDINGS',
        message: 'Mỗi quản lý chỉ phụ trách tối đa 2 tòa',
      },
    });
  });

  it('scenario 7: trigger message BUILDING_MANAGER_ROLE -> 400 VALIDATION_FAILED + fields.managerId', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new Error('BUILDING_MANAGER_ROLE: user is not an active manager'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { managerId: 'Người được gán phải là quản lý đang hoạt động' },
      },
    });
  });

  it('scenario 8: CHECK constraint buildings_code_format -> 400 VALIDATION_FAILED + fields.code', () => {
    const { host, status, json } = fakeHost();
    filter.catch(
      new Error('new row for relation "buildings" violates check constraint "buildings_code_format"'),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Dữ liệu không hợp lệ',
        fields: { code: 'Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9' },
      },
    });
  });

  it('scenario 9: unrecognized PrismaClientKnownRequestError (P2003 FK on tenant_id) -> 500 INTERNAL_ERROR, body has no DB words', () => {
    const { host, status, json } = fakeHost();
    const exception = Object.assign(
      new Error("Foreign key constraint failed on the field: 'tenant_id'"),
      { code: 'P2003', name: 'PrismaClientKnownRequestError' },
    );
    filter.catch(exception, host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as { error: { code: string; message: string } };
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Có lỗi xảy ra, vui lòng thử lại sau' },
    });
    const rendered = JSON.stringify(body);
    expect(rendered).not.toContain('tenant_id');
    expect(rendered).not.toContain('constraint');
    expect(rendered).not.toContain('relation');
    expect(rendered).not.toContain('Foreign key');
    expect(loggerError).toHaveBeenCalled();
  });

  it('scenario 10: PrismaClientUnknownRequestError with a connection string in its message -> 500, message not leaked', () => {
    const { host, status, json } = fakeHost();
    const secretMessage =
      'connection to server at "db.internal" failed: password=SUPERSECRET123 user=postgres';
    const exception = Object.assign(new Error(secretMessage), {
      name: 'PrismaClientUnknownRequestError',
    });
    filter.catch(exception, host);
    expect(status).toHaveBeenCalledWith(500);
    const rendered = JSON.stringify(json.mock.calls[0][0]);
    expect(rendered).not.toContain('SUPERSECRET123');
    expect(rendered).not.toContain('db.internal');
    expect(loggerError).toHaveBeenCalled();
    expect(String(loggerError.mock.calls[0][0])).toContain('SUPERSECRET123');
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT_STATE'],
  ])('scenario 11: pre-existing HttpException(%i) keeps its Phase-1 mapping to %s', (status, code) => {
    const { host, status: statusFn, json } = fakeHost();
    filter.catch(new HttpException('x', status), host);
    expect(statusFn).toHaveBeenCalledWith(status);
    expect((json.mock.calls[0][0] as { error: { code: string } }).error.code).toBe(code);
  });

  it('scenario 12: throwing ErrorCode.PRICE_PROPOSAL_EXPIRED -> 409 with the spec wording (PRC-07, RATE-05)', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new HttpException(ErrorCode.PRICE_PROPOSAL_EXPIRED, 409), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PRICE_PROPOSAL_EXPIRED',
        message: 'Đề xuất đã quá ngày hiệu lực, vui lòng đề xuất lại',
      },
    });
  });

  it('scenario 13: throwing ErrorCode.UPLOAD_NOT_CONFIGURED -> 503 with the spec wording (FILE-01)', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new HttpException(ErrorCode.UPLOAD_NOT_CONFIGURED, 503), host);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UPLOAD_NOT_CONFIGURED', message: 'Chưa cấu hình tải ảnh' },
    });
  });

  it('API-03: a DB error is never logged with a code other than INTERNAL_ERROR (mapped codes do not spam the server log)', () => {
    const { host } = fakeHost();
    filter.catch({ code: 'P2002', meta: { target: 'users_phone_key' } }, host);
    expect(loggerError).not.toHaveBeenCalled();
  });
});
