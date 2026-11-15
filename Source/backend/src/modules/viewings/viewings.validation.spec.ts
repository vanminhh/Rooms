import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { validationExceptionFactory } from '../../common/errors/validation.js';
import { BookViewingDto, ConfirmViewingDto, CreateViewingDto, UpdateViewingDto, ViewingTimesQueryDto } from './dto/viewings.dto.js';
import { MeViewingsController } from './me-viewings.controller.js';
import { ViewingsController } from './viewings.controller.js';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory });
const body = { roomId: 101, visitAt: '2026-11-16T03:00:00Z' };

describe('VIEW-01/21 trust-boundary validation without HTTP transport', () => {
  it.each(['guestPhone', 'guestName', 'userId', 'status', 'website', 'visitDate', 'timeSlot'])('VIEW-01: booking refuses override %s', async key => {
    await expect(pipe.transform({ ...body, [key]: 'override' }, { type: 'body', metatype: BookViewingDto })).rejects.toMatchObject({ status: 400 });
  });
  it.each([null, undefined, 12, {}, 'x'.repeat(65)])('VIEW-08: visitAt must be a bounded string (%j)', async value => {
    await expect(pipe.transform({ ...body, visitAt: value }, { type: 'body', metatype: BookViewingDto })).rejects.toMatchObject({ status: 400 });
  });
  it('VIEW-03: manual identity must be valid and notes are bounded', async () => {
    await expect(pipe.transform({ ...body, guestName: 'Khách', guestPhone: '123' }, { type: 'body', metatype: CreateViewingDto })).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ ...body, note: 'a'.repeat(501) }, { type: 'body', metatype: BookViewingDto })).rejects.toMatchObject({ status: 400 });
    expect(await pipe.transform({ ...body, note: '原文 – giữ nguyên' }, { type: 'body', metatype: BookViewingDto })).toMatchObject({ note: '原文 – giữ nguyên' });
  });
  it.each(['phone', 'guestPhone', 'userId', 'accountId'])('VIEW-21: availability rejects identity override %s', async key => {
    await expect(pipe.transform({ from: '2026-11-16', to: '2026-11-16', [key]: 'override' }, { type: 'query', metatype: ViewingTimesQueryDto })).rejects.toMatchObject({ status: 400 });
  });
  it('VIEW-04/09/15: removed metadata/legacy write fields and invalid action are rejected', async () => {
    for (const key of ['visitDate', 'timeSlot', 'confirmedAt', 'confirmedVia', 'cancelledBy']) {
      await expect(pipe.transform({ [key]: 'x' }, { type: 'body', metatype: UpdateViewingDto })).rejects.toMatchObject({ status: 400 });
    }
    await expect(pipe.transform({ via: 'SMS' }, { type: 'body', metatype: ConfirmViewingDto })).rejects.toMatchObject({ status: 400 });
    await expect(pipe.transform({ status: 'NO_SHOW' }, { type: 'body', metatype: UpdateViewingDto })).rejects.toMatchObject({ status: 400 });
  });
});

describe('SCOPE-03: real role guard on every new viewing handler', () => {
  const guard = new RolesGuard(new Reflector());
  for (const role of ['GUEST', 'TENANT', 'BOSS', 'MANAGER']) {
    it(`VIEW-01/18/20/21: ${role} access is checked on the actual controllers`, () => {
      for (const method of ['list', 'book', 'detail', 'cancel', 'times'] as const) {
        const context: any = { getClass: () => MeViewingsController, getHandler: () => MeViewingsController.prototype[method], switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) };
        if (role === 'GUEST' || role === 'TENANT') expect(guard.canActivate(context)).toBe(true);
        else expect(() => guard.canActivate(context)).toThrow();
      }
      // Read method metadata only; the guard does not invoke this unbound method.
      const context: any = { getClass: () => ViewingsController, getHandler: () => Reflect.get(ViewingsController.prototype, 'confirm'), switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) };
      if (role === 'BOSS' || role === 'MANAGER') expect(guard.canActivate(context)).toBe(true);
      else expect(() => guard.canActivate(context)).toThrow();
    });
  }
});
