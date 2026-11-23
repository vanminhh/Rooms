import { describe, expect, it } from 'vitest';
import { assertMeterPhoto } from '../meters/save-reading.js';
import { isMeterPhotoUrl, meterPhotoFolder } from './cloudinary.js';

// Q-P4-58 (D-38): meter photos live in the room's own signed folder; anything else is refused.
const ok = 'https://res.cloudinary.com/demo/image/upload/v1732300000/meters/2/8/abc_DEF-1.webp';

describe('Q-P4-58 meter photo URL', () => {
  it('Q-P4-58: a delivery URL in meters/{building}/{room} of our cloud is accepted', () => {
    expect(meterPhotoFolder(2, 8)).toBe('meters/2/8');
    expect(isMeterPhotoUrl(ok, 'demo', 2, 8)).toBe(true);
  });

  it('Q-P4-58: another cloud, room, building, gallery folder, sub-folder, format or host is refused', () => {
    for (const url of [
      ok.replace('/demo/', '/other/'), ok.replace('/meters/2/8/', '/meters/2/9/'), ok.replace('/meters/2/8/', '/meters/3/8/'),
      ok.replace('/meters/2/8/', '/rooms/2/8/'), ok.replace('/meters/2/8/', '/meters/2/8/x/'), ok.replace('.webp', '.svg'),
      ok.replace('https://res.cloudinary.com', 'https://evil.test'), `${ok}?x=1`, 'javascript:alert(1)',
    ]) expect(isMeterPhotoUrl(url, 'demo', 2, 8)).toBe(false);
  });

  it('Q-P4-58: assertMeterPhoto needs a configured cloud; no photo is fine (D-38)', () => {
    const env = { CLOUDINARY_URL: 'cloudinary://key:secret@demo' } as NodeJS.ProcessEnv;
    expect(() => assertMeterPhoto(ok, 2, 8, env)).not.toThrow();
    expect(() => assertMeterPhoto(undefined, 2, 8, {})).not.toThrow();
    expect(() => assertMeterPhoto(ok, 2, 9, env)).toThrow();
    expect(() => assertMeterPhoto(ok, 2, 8, {})).toThrow();
  });
});

describe('Q-P4-58 meter photo signing', () => {
  it('Q-P4-58: METER_PHOTO signs the room meter folder with the same scope rule as room images', async () => {
    const { signRoomImageUpload } = await import('./files.service.js');
    const db = { room: { findFirst: async () => ({ id: 8, buildingId: 2, isActive: true }) } };
    const env = { CLOUDINARY_URL: 'cloudinary://key:secret@demo' } as NodeJS.ProcessEnv;
    const signed = await signRoomImageUpload(db as never, { buildingIds: [2] }, { roomId: 8 }, env, new Date(), meterPhotoFolder);
    expect(signed.folder).toBe('meters/2/8');
    await expect(signRoomImageUpload(db as never, { buildingIds: [5] }, { roomId: 8 }, env, new Date(), meterPhotoFolder)).rejects.toMatchObject({ status: 403 });
  });
});
