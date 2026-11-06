import { Prisma } from '@prisma/client';

describe('rooms schema and asset ID migration', () => {
  it('ROOM-07/DB-02/DB-07: maps required unique assetId to room_images.asset_id', () => {
    const roomImage = Prisma.dmmf.datamodel.models.find((model) => model.name === 'RoomImage');
    const assetId = roomImage?.fields.find((field) => field.name === 'assetId');

    expect(assetId).toMatchObject({
      name: 'assetId',
      dbName: 'asset_id',
      kind: 'scalar',
      type: 'String',
      isRequired: true,
      isUnique: true,
    });
  });

  it('G-01/G-02: keeps room money integer and business dates mapped to PostgreSQL date', () => {
    const room = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Room');
    const contract = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Contract');
    const price = room?.fields.find((field) => field.name === 'price');
    const startDate = contract?.fields.find((field) => field.name === 'startDate');

    expect(price).toMatchObject({ kind: 'scalar', type: 'Int' });
    expect(startDate).toMatchObject({ kind: 'scalar', type: 'DateTime', nativeType: ['Date', []] });
  });
});
