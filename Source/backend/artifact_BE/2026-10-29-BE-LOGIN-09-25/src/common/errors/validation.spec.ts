import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Matches } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation.js';

const ENGLISH = 'an unknown value was passed to the validate function';

describe('G-03 / P13: validationExceptionFactory', () => {
  it('P13: a body that is not an object (unknownValue, no property) -> { code } only, no fields, no English', () => {
    const errors = [
      { property: undefined, constraints: { unknownValue: ENGLISH }, children: [] },
    ] as unknown as ValidationError[];
    const exception = validationExceptionFactory(errors);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({ code: 'VALIDATION_FAILED' });
    expect(JSON.stringify(exception.getResponse())).not.toContain('unknown value');
    expect(exception.getResponse()).not.toHaveProperty('fields');
  });

  it('G-03: an error with a property still gives fields.<property> as in part 1 (phone)', () => {
    const errors = [
      { property: 'phone', constraints: { matches: 'Số điện thoại không hợp lệ' }, children: [] },
    ] as unknown as ValidationError[];
    expect(validationExceptionFactory(errors).getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      fields: { phone: 'Số điện thoại không hợp lệ' },
    });
  });

  it('G-03: a property error next to a property-less error keeps the field and drops the English one', () => {
    const errors = [
      { property: undefined, constraints: { unknownValue: ENGLISH }, children: [] },
      { property: 'password', constraints: { isNotEmpty: 'Vui lòng nhập mật khẩu' }, children: [] },
    ] as unknown as ValidationError[];
    expect(validationExceptionFactory(errors).getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      fields: { password: 'Vui lòng nhập mật khẩu' },
    });
  });

  it('G-03: nested errors keep the dotted path (address.street)', () => {
    const errors = [
      {
        property: 'address',
        children: [{ property: 'street', constraints: { isString: 'Đường không hợp lệ' }, children: [] }],
      },
    ] as unknown as ValidationError[];
    expect(validationExceptionFactory(errors).getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      fields: { 'address.street': 'Đường không hợp lệ' },
    });
  });

  it('G-03: a property that is not allowed (whitelistValidation) keeps the Vietnamese wording from part 1', () => {
    const errors = [
      { property: 'role', constraints: { whitelistValidation: 'property role should not exist' }, children: [] },
    ] as unknown as ValidationError[];
    const response = validationExceptionFactory(errors).getResponse() as { fields: Record<string, string> };
    expect(response.fields.role).toBe('Trường này không được phép gửi lên');
    expect(JSON.stringify(response)).not.toContain('should not exist');
  });

  it('G-03: with several constraints on one property the first message is used', () => {
    const errors = [
      {
        property: 'name',
        constraints: { isString: 'Phải là chuỗi', minLength: 'Phải có ít nhất 5 ký tự' },
        children: [],
      },
    ] as unknown as ValidationError[];
    expect(validationExceptionFactory(errors).getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      fields: { name: 'Phải là chuỗi' },
    });
  });

  it('P13: an empty error list also gives { code } without fields', () => {
    expect(validationExceptionFactory([]).getResponse()).toEqual({ code: 'VALIDATION_FAILED' });
  });
});

// Real ValidationPipe + real class-validator, configured like app.setup.ts: the errors are not hand-made.
class PhoneBody {
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;
}

describe('P13: real class-validator output through ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  });
  const meta = { type: 'body' as const, metatype: PhoneBody };

  async function responseOf(body: unknown): Promise<unknown> {
    try {
      await pipe.transform(body, meta);
    } catch (e) {
      return (e as BadRequestException).getResponse();
    }
    return 'no error';
  }

  it('P13: body [] -> { code: VALIDATION_FAILED } with no English text and no fields', async () => {
    const response = await responseOf([]);
    expect(response).toEqual({ code: 'VALIDATION_FAILED' });
  });

  it('G-03: body {} -> fields.phone in Vietnamese', async () => {
    expect(await responseOf({})).toEqual({
      code: 'VALIDATION_FAILED',
      fields: { phone: 'Số điện thoại không hợp lệ' },
    });
  });

  it('G-03: an extra property is reported in Vietnamese', async () => {
    expect(await responseOf({ phone: '0900000001', role: 'BOSS' })).toEqual({
      code: 'VALIDATION_FAILED',
      fields: { role: 'Trường này không được phép gửi lên' },
    });
  });
});
