import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateRequestDto, requestPayload } from './request.dto.js';
import { RequestsService, notifyRequestChange } from './requests.service.js';

it('preserves the moderated comment when its author edits the rating', async () => {
  const stamp = new Date();
  const row = { id: 2, type: 'INCIDENT', status: 'CLOSED', reviewHiddenAt: stamp, reviewAt: stamp, reviewComment: 'moderated' };
  const update = vi.fn(async ({ data }) => ({ ...row, ...data }));
  const tx = { $queryRaw: vi.fn(), request: { findFirst: vi.fn(async () => row), update } };
  const db = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
  const service = new RequestsService(db as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const result = await service.review({ id: 1 } as never, 2, { rating: 4, comment: '' }, '"' + stamp.toISOString() + '"');
  expect(update.mock.calls[0][0].data).not.toHaveProperty('reviewComment');
  expect(result.reviewComment).toBeNull();
});

describe('REQ-01/02 submission validation', () => {
  it.each([
    ['RENEW', { termMonths: 2 }], ['RENEW', { termMonths: 3, contractId: 9 }],
    ['MOVE_OUT', { plannedMoveOutDate: '2027-02-30' }], ['INCIDENT', { cost: 500 }],
    ['PAYMENT_ISSUE', { invoiceId: 1, transferredAt: '2028-01-01', amount: 400 }],
    ['OCCUPANT_CHANGE', { add: [{ fullName: 'An', moveInDate: '2027-01-01', isSigner: true }] }],
    ['VEHICLE_CHANGE', { remove: [{ vehicleId: -7, removedAt: '2027-01-01' }] }],
  ] as const)('%s rejects invalid or staff-only fields', (type, payload) => {
    expect(() => requestPayload(type, payload)).toThrow();
  });
  it('D-45 accepts five unique photo attachments and rejects six', () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({ assetId: 'a' + i, publicId: 'p' + i, version: 1, format: 'jpg' }));
    const dto = { contractId: 1, type: 'INCIDENT', title: 'Water' };
    expect(validateSync(plainToInstance(CreateRequestDto, { ...dto, photos: photos.slice(0, 5) }))).toHaveLength(0);
    expect(validateSync(plainToInstance(CreateRequestDto, { ...dto, photos })).map(e => e.property)).toContain('photos');
  });
});

it.each(['vi', 'en'])('REQ-08: status notification for a long title is safe and localized (%s)', async locale => {
  const tx = { user: { findUniqueOrThrow: vi.fn(async () => ({ locale })) }, notification: { create: vi.fn() } };
  const title = '🛠'.repeat(150);
  await notifyRequestChange(tx as unknown as Prisma.TransactionClient, { createdById: 2, id: 3, title, status: 'RESOLVED' });
  const message = tx.notification.create.mock.calls[0][0].data;
  expect(message.link).toBe('/thue/yeu-cau/3');
  expect(message.body).toBe(title);
  expect(Array.from(message.title)).toHaveLength(150);
  expect(message.title.endsWith(locale === 'vi' ? 'Hoàn thành' : 'Resolved')).toBe(true);
});
