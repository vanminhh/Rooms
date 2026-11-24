import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation.js';
import { SignUploadDto } from './sign.dto.js';

const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory,
});
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: SignUploadDto });

describe('BE-P3-04 / FILE-01 / API-04: upload purpose and target validation', () => {
  it.each(['CONTRACT_SCAN', 'ID_PHOTO', 'REQUEST_PHOTO'])('accepts a contract ID for %s', async (purpose) => {
    await expect(validate({ purpose, contractId: '42' })).resolves.toMatchObject({ purpose, contractId: 42 });
  });

  it('FILE-01: accepts a ROOM_IMAGE ID string and keeps the existing missing-field messages', async () => {
    await expect(validate({ purpose: 'ROOM_IMAGE', roomId: '42' })).resolves.toMatchObject({
      purpose: 'ROOM_IMAGE', roomId: 42,
    });
    await expect(validate({})).rejects.toMatchObject({
      status: 400, response: { code: 'VALIDATION_FAILED', fields: {
        purpose: 'Mục đích tải ảnh không hợp lệ', roomId: 'Mã phòng không hợp lệ',
      } },
    });
  });

  it.each([
    [{ purpose: 'CONTRACT_SCAN' }, 'contractId'],
    [{ purpose: 'CONTRACT_SCAN', contractId: true }, 'contractId'],
    [{ purpose: 'ID_PHOTO', contractId: 2147483648 }, 'contractId'],
    [{ purpose: 'ID_PHOTO', contractId: 42, roomId: 1 }, 'roomId'],
    [{ purpose: 'ROOM_IMAGE', roomId: 1, contractId: null }, 'contractId'],
    [{ purpose: 'ID_PHOTO', contractId: 42, type: 'upload' }, 'type'],
  ])('rejects an invalid or irrelevant field in %j', async (body, field) => {
    await expect(validate(body)).rejects.toMatchObject({
      status: 400, response: { code: 'VALIDATION_FAILED', fields: { [field]: expect.any(String) } },
    });
  });
});
