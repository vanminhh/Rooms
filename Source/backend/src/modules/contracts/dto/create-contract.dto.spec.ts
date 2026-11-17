import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation.js';
import { CreateContractDto } from './create-contract.dto.js';

const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory,
});
const valid = {
  roomId: 1, signer: { fullName: 'Người Ký', phone: '0912345678' },
  startDate: '2027-01-31', termMonths: 3, serviceIds: [],
};
const validate = (overrides: Record<string, unknown>) =>
  pipe.transform({ ...valid, ...overrides }, { type: 'body', metatype: CreateContractDto });

describe('CON-01: create contract request', () => {
  it('accepts a signer without a document, and an explicit zero deposit', async () => {
    await expect(validate({ deposit: 0 })).resolves.toMatchObject({ ...valid, deposit: 0 });
  });

  it('CON-04 / Q-P3-11: keeps the leading zeros of a 12-digit CCCD', async () => {
    const signer = { ...valid.signer, idNumber: '000123456789', phone: '0912345678 ' };
    await expect(validate({ signer })).resolves.toMatchObject({
      signer: { ...signer, phone: '0912345678' },
    });
  });

  it.each([
    [{ roomId: true }, 'roomId'],
    [{ roomId: 2147483648 }, 'roomId'],
    [{ signer: null }, 'signer'],
    [{ signer: [] }, 'signer'],
    [{ signer: { ...valid.signer, fullName: '  ' } }, 'signer.fullName'],
    [{ signer: { ...valid.signer, phone: '01234' } }, 'signer.phone'],
    [{ signer: { ...valid.signer, email: 'bad' } }, 'signer.email'],
    [{ signer: { ...valid.signer, dateOfBirth: '2001-02-29' } }, 'signer.dateOfBirth'],
    [{ signer: { ...valid.signer, idNumber: '123456789' } }, 'signer.idNumber'],
    [{ signer: { ...valid.signer, idNumber: 'P12345678901' } }, 'signer.idNumber'],
    [{ signer: { ...valid.signer, idFront: 'private-id' } }, 'signer.idFront'],
    [{ startDate: '2027-02-29' }, 'startDate'],
    [{ termMonths: 3.5 }, 'termMonths'],
    [{ deposit: -1 }, 'deposit'],
    [{ deposit: 0.5 }, 'deposit'],
    [{ deposit: 2147483648 }, 'deposit'],
    [{ serviceIds: [1, 1] }, 'serviceIds'],
    [{ serviceIds: ['1'] }, 'serviceIds'],
    [{ terms: 123 }, 'terms'],
    [{ viewingId: 0 }, 'viewingId'],
    [{ confirmedGuestAccountId: '9' }, 'confirmedGuestAccountId'],
    [{ confirmDifferentViewingOwner: 'true' }, 'confirmDifferentViewingOwner'],
  ])('reports an invalid or unavailable field in %j', async (payload, field) => {
    await expect(validate(payload)).rejects.toMatchObject({
      status: 400, response: { code: 'VALIDATION_FAILED', fields: { [field]: expect.any(String) } },
    });
  });
});
