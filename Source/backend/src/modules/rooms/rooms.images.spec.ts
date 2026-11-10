import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

type Asset = { assetId: string; publicId: string; version: number; format: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function cloudResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function bodyText(body: BodyInit | null | undefined): string {
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('Expected URL-encoded Cloudinary request body');
}

function makeImageHarness(options: { count?: number; roomBuildingId?: number } = {}) {
  const events: string[] = [];
  const images = Array.from({ length: options.count ?? 1 }, (_, index) => ({
    id: 501 + index,
    roomId: 101,
    assetId: `asset-old-${index + 1}`,
    publicId: `rooms/10/101/photo-${index + 1}`,
    url: `https://res.cloudinary.com/demo/image/upload/v7/rooms/10/101/photo-${index + 1}.jpg`,
    sortOrder: index,
  }));
  const assets = new Map<string, Asset>();
  for (const image of images) {
    assets.set(image.assetId, { assetId: image.assetId, publicId: image.publicId, version: 7, format: 'jpg' });
  }
  let lockTail = Promise.resolve();
  const tx: any = {
    $queryRaw: vi.fn(async () => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((done) => { release = done; });
      await previous;
      events.push('room:lock-acquired');
      tx.releaseRoomLock = release;
      return [{ id: 101 }];
    }),
    room: {
      findUnique: vi.fn(async () => ({ id: 101, buildingId: options.roomBuildingId ?? 10 })),
      findFirst: vi.fn(async () => ({ id: 101, buildingId: options.roomBuildingId ?? 10 })),
    },
    roomImage: {
      findFirst: vi.fn(async ({ where }: any) => images.find((image) => image.id === where.id && image.roomId === where.roomId) ?? null),
      findMany: vi.fn(async ({ where }: any) => images.filter((image) => image.roomId === where.roomId)),
      count: vi.fn(async ({ where }: any) => images.filter((image) => image.roomId === where.roomId).length),
      delete: vi.fn(async ({ where }: any) => {
        const index = images.findIndex((image) => image.id === where.id && image.roomId === 101);
        if (index < 0) throw new Error('missing test image');
        const [deleted] = images.splice(index, 1);
        events.push(`roomImage:row-deleted:${deleted.assetId}`);
        return deleted;
      }),
      create: vi.fn(async ({ data }: any) => {
        const image = { id: 502 + images.length, ...data };
        images.push(image);
        events.push(`roomImage:row-created:${image.assetId}`);
        return image;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const image = images.find((item) => item.id === where.id);
        if (!image) throw new Error('missing test image');
        Object.assign(image, data);
        return image;
      }),
    },
  };
  const prisma: any = {
    $transaction: vi.fn(async (work: (client: any) => Promise<unknown>) => {
      try {
        return await work(tx);
      } finally {
        tx.releaseRoomLock?.();
        tx.releaseRoomLock = undefined;
        events.push('room:lock-released');
      }
    }),
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (init?.method === 'GET') {
      const assetId = decodeURIComponent(url.split('/').at(-1) ?? '');
      const asset = assets.get(assetId);
      return asset
        ? cloudResponse({ asset_id: asset.assetId, public_id: asset.publicId, version: asset.version, format: asset.format, resource_type: 'image', type: 'upload' })
        : cloudResponse({}, 404);
    }
    if (init?.method === 'POST') {
      const body = new URLSearchParams(bodyText(init.body));
      const assetId = body.get('asset_id') ?? '';
      events.push(`cloudinary:destroy:${assetId}`);
      assets.delete(assetId);
      return cloudResponse({ result: 'ok' });
    }
    throw new Error(`Unexpected Cloudinary request ${url}`);
  });
  return { service: new RoomsService(prisma), prisma, tx, images, assets, events, fetchMock };
}

const boss: any = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const addDto = (assetId: string, publicId = 'rooms/10/101/front-door', version = 8) => ({
  assetId, publicId, version, format: 'jpg' as const,
});
const env = { CLOUDINARY_URL: 'cloudinary://test-key:test-secret@demo' };

describe('BE-P2-21 · room image lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('ROOM-07/FILE-02: adds a verified immutable asset ID and omits it from the room image response', async () => {
    const h = makeImageHarness();
    h.assets.set('asset-new', { assetId: 'asset-new', publicId: 'rooms/10/101/front-door', version: 8, format: 'jpg' });
    vi.stubGlobal('fetch', h.fetchMock);
    vi.stubEnv('CLOUDINARY_URL', env.CLOUDINARY_URL);

    const result = await h.service.addImage(boss, 101, addDto('asset-new') as any);

    expect(result).toMatchObject({ roomId: 101, publicId: 'rooms/10/101/front-door', sortOrder: 1 });
    expect(result).not.toHaveProperty('assetId');
    expect(h.images.at(-1)).toMatchObject({ assetId: 'asset-new', publicId: 'rooms/10/101/front-door' });
    expect(h.fetchMock.mock.calls[0]?.[0]).toBe('https://api.cloudinary.com/v1_1/demo/resources/asset-new');
  });

  it('FILE-02/ROOM-07: rejects a fake or mismatched asset ID without attaching a row', async () => {
    const h = makeImageHarness();
    vi.stubGlobal('fetch', h.fetchMock);
    vi.stubEnv('CLOUDINARY_URL', env.CLOUDINARY_URL);

    await expect(h.service.addImage(boss, 101, addDto('asset-does-not-exist') as any)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { assetId: expect.any(String) } },
    });
    expect(h.images).toHaveLength(1);

    h.assets.set('asset-real', { assetId: 'asset-real', publicId: 'rooms/10/101/front-door', version: 8, format: 'jpg' });
    const mismatchedFetch = vi.fn(async () => cloudResponse({
      asset_id: 'some-other-asset', public_id: 'rooms/10/101/front-door', version: 8,
      format: 'jpg', resource_type: 'image', type: 'upload',
    }));
    vi.stubGlobal('fetch', mismatchedFetch);
    await expect(h.service.addImage(boss, 101, addDto('asset-real') as any)).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { assetId: expect.any(String) } },
    });
    expect(h.images).toHaveLength(1);
  });

  it('ROOM-07: rejects the eleventh room image with CONFLICT_STATE', async () => {
    const h = makeImageHarness({ count: 10 });
    h.assets.set('asset-eleven', { assetId: 'asset-eleven', publicId: 'rooms/10/101/photo-eleven', version: 1, format: 'jpg' });
    vi.stubGlobal('fetch', h.fetchMock);
    vi.stubEnv('CLOUDINARY_URL', env.CLOUDINARY_URL);

    await expect(h.service.addImage(boss, 101, addDto('asset-eleven', 'rooms/10/101/photo-eleven', 1) as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(h.images).toHaveLength(10);
  });

  it('ROOM-07: reorders the exact image set and accepts an empty order for an empty room', async () => {
    const h = makeImageHarness({ count: 2 });

    await expect(h.service.reorderImages(boss, 101, { imageIds: [502, 501] } as any)).resolves.toMatchObject([
      { id: 502, sortOrder: 0 }, { id: 501, sortOrder: 1 },
    ]);
    expect(h.images.map((image) => image.sortOrder)).toEqual([1, 0]);
    await expect(h.service.reorderImages(boss, 101, { imageIds: [501] } as any)).rejects.toBeInstanceOf(BadRequestException);

    const empty = makeImageHarness({ count: 0 });
    await expect(empty.service.reorderImages(boss, 101, { imageIds: [] } as any)).resolves.toEqual([]);
  });

  it('SCOPE-02/ROOM-07: a manager outside the room building cannot add, reorder, or delete images', async () => {
    const h = makeImageHarness();
    const manager: any = { id: 22, role: 'MANAGER', mustChangePassword: false, buildingIds: [11] };

    await expect(h.service.addImage(manager, 101, addDto('asset-new') as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.reorderImages(manager, 101, { imageIds: [501] } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.deleteImage(manager, 101, 501)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.images).toHaveLength(1);
  });

  it('ROOM-07/FILE-02: deletes the row first and destroys only its immutable asset ID', async () => {
    const h = makeImageHarness();
    vi.stubGlobal('fetch', h.fetchMock);
    vi.stubEnv('CLOUDINARY_URL', env.CLOUDINARY_URL);

    await expect(h.service.deleteImage(boss, 101, 501)).resolves.toBeUndefined();

    expect(h.events).toEqual(['room:lock-acquired', 'roomImage:row-deleted:asset-old-1', 'room:lock-released', 'cloudinary:destroy:asset-old-1']);
    const destroy = h.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1];
    expect(destroy?.method).toBe('POST');
    const body = new URLSearchParams(bodyText(destroy?.body));
    expect(body.get('asset_id')).toBe('asset-old-1');
    expect(body.has('public_id')).toBe(false);
    expect(h.assets.has('asset-old-1')).toBe(false);
    expect(h.images).toEqual([]);
  });

  it('ROOM-07/FILE-02: reuses a publicId after deletion while the old asset destroy is still pending', async () => {
    const h = makeImageHarness();
    const destroyStarted = deferred<void>();
    const finishLateDestroy = deferred<void>();
    let remoteOldAssetPresent = true;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'GET') return cloudResponse({
        asset_id: 'asset-new', public_id: 'rooms/10/101/front-door', version: 9,
        format: 'jpg', resource_type: 'image', type: 'upload',
      });
      const body = new URLSearchParams(bodyText(init?.body));
      expect(body.get('asset_id')).toBe('asset-old-1');
      expect(body.has('public_id')).toBe(false);
      destroyStarted.resolve();
      void finishLateDestroy.promise.then(() => { remoteOldAssetPresent = false; });
      throw new Error('simulated request timeout after Cloudinary accepted asset-id destroy');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CLOUDINARY_URL', env.CLOUDINARY_URL);

    await h.service.deleteImage(boss, 101, 501);
    h.assets.set('asset-new', { assetId: 'asset-new', publicId: 'rooms/10/101/front-door', version: 9, format: 'jpg' });
    await h.service.addImage(boss, 101, addDto('asset-new', 'rooms/10/101/front-door', 9) as any);
    expect(h.images).toHaveLength(1);
    expect(h.images[0]).toMatchObject({ assetId: 'asset-new', publicId: 'rooms/10/101/front-door' });

    await destroyStarted.promise;
    finishLateDestroy.resolve();
    await Promise.resolve();
    expect(remoteOldAssetPresent).toBe(false);
    expect(h.assets.has('asset-new')).toBe(true);
    expect(h.images[0]).toMatchObject({ assetId: 'asset-new', publicId: 'rooms/10/101/front-door' });
  });

  it.each(['success', 'failure', 'timeout'] as const)(
    'ROOM-07/FILE-02: %s destroy always targets the deleted asset ID after publicId reuse',
    async (outcome) => {
      const h = makeImageHarness();
      const delayedDestroy = deferred<void>();
      const finishDestroy = deferred<void>();
      let deletedRemoteAssetIds: string[] = [];
      const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return cloudResponse({
            asset_id: 'asset-new', public_id: 'rooms/10/101/photo-1', version: 9,
            format: 'jpg', resource_type: 'image', type: 'upload',
          });
        }
        const body = new URLSearchParams(bodyText(init?.body));
        const target = body.get('asset_id');
        expect(target).toBe('asset-old-1');
        expect(body.has('public_id')).toBe(false);
        if (outcome === 'timeout') {
          delayedDestroy.resolve();
          void finishDestroy.promise.then(() => { deletedRemoteAssetIds.push(target ?? ''); });
          throw new Error('simulated Cloudinary timeout');
        }
        if (outcome === 'failure') return cloudResponse({ error: 'temporary failure' }, 500);
        deletedRemoteAssetIds.push(target ?? '');
        return cloudResponse({ result: 'ok' });
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.stubEnv('CLOUDINARY_URL', env.CLOUDINARY_URL);

      await expect(h.service.deleteImage(boss, 101, 501)).resolves.toBeUndefined();
      h.assets.set('asset-new', { assetId: 'asset-new', publicId: 'rooms/10/101/photo-1', version: 9, format: 'jpg' });
      await expect(h.service.addImage(boss, 101, addDto('asset-new', 'rooms/10/101/photo-1', 9) as any))
        .resolves.toMatchObject({ publicId: 'rooms/10/101/photo-1' });

      if (outcome === 'timeout') {
        await delayedDestroy.promise;
        finishDestroy.resolve();
        await Promise.resolve();
      }
      expect(h.images).toHaveLength(1);
      expect(h.images[0]).toMatchObject({ assetId: 'asset-new', publicId: 'rooms/10/101/photo-1' });
      expect(deletedRemoteAssetIds).toEqual(outcome === 'success' ? ['asset-old-1'] : outcome === 'timeout' ? ['asset-old-1'] : []);
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    },
  );
});
