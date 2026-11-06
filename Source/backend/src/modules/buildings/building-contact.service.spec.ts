import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BuildingContactService } from './building-contact.service.js';
import { BuildingsModule } from './buildings.module.js';
import { SettingsService } from '../settings/settings.service.js';

describe('BuildingContactService', () => {
  // SettingsService is an outside edge: fake only its default-contact lookup, never the resolver.
  const bossContact = { phone: '0900000001', zaloUrl: 'https://zalo.example/boss', facebookUrl: 'https://facebook.example/boss' };
  const managerContact = { phone: '0911111111', zaloUrl: 'https://zalo.example/manager', facebookUrl: 'https://facebook.example/manager' };

  function setup(initial: typeof bossContact | null = bossContact) {
    let current = initial;
    const getDefaultContact = vi.fn(async () => current);
    const settings = { getDefaultContact } as unknown as SettingsService;
    return {
      service: new BuildingContactService(settings),
      getDefaultContact,
      setDefaultContact(value: typeof bossContact | null) { current = value; },
    };
  }

  it('BLD-04: no manager uses all Boss default contact fields', async () => {
    const h = setup();
    await expect(h.service.buildingContact({ manager: null })).resolves.toEqual(bossContact);
    expect(h.getDefaultContact).toHaveBeenCalledOnce();
  });

  it('BLD-04, AUTH-08: inactive manager falls back to Boss contact', async () => {
    const h = setup();
    await expect(h.service.buildingContact({ manager: { isActive: false, contactPhone: managerContact.phone, zaloUrl: managerContact.zaloUrl, facebookUrl: managerContact.facebookUrl } })).resolves.toEqual(bossContact);
    expect(h.getDefaultContact).toHaveBeenCalledOnce();
  });

  it('BLD-04, D2-18: active manager without contactPhone falls back to Boss contact', async () => {
    const h = setup();
    await expect(h.service.buildingContact({ manager: { isActive: true, contactPhone: null, zaloUrl: managerContact.zaloUrl, facebookUrl: managerContact.facebookUrl } })).resolves.toEqual(bossContact);
    expect(h.getDefaultContact).toHaveBeenCalledOnce();
  });

  it('BLD-04, AUTH-09: active manager with contactPhone returns exactly their three public contact fields', async () => {
    const h = setup();
    const result = await h.service.buildingContact({ manager: { isActive: true, contactPhone: managerContact.phone, zaloUrl: managerContact.zaloUrl, facebookUrl: managerContact.facebookUrl } });
    expect(result).toEqual(managerContact);
    expect(Object.keys(result ?? {}).sort()).toEqual(['facebookUrl', 'phone', 'zaloUrl']);
    expect(h.getDefaultContact).not.toHaveBeenCalled();
  });

  it('BLD-04, AUTH-09: never returns manager login phone or internal fields', async () => {
    const h = setup();
    const loginPhone = '0987654321';
    const building = { manager: { isActive: true, contactPhone: managerContact.phone, zaloUrl: null, facebookUrl: null, phone: loginPhone, id: 42, passwordHash: 'secret' } } as any;
    const result = await h.service.buildingContact(building);
    expect(result).toEqual({ phone: managerContact.phone, zaloUrl: null, facebookUrl: null });
    expect(JSON.stringify(result)).not.toContain(loginPhone);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('BLD-04: null settings returns null, and changed defaults or manager state take effect on each read', async () => {
    const h = setup(null);
    const building: { manager: { isActive: boolean; contactPhone: string | null; zaloUrl: string | null; facebookUrl: string | null } | null } = { manager: null };
    await expect(h.service.buildingContact(building)).resolves.toBeNull();
    h.setDefaultContact(bossContact);
    await expect(h.service.buildingContact(building)).resolves.toEqual(bossContact);
    building.manager = { isActive: true, contactPhone: managerContact.phone, zaloUrl: null, facebookUrl: null };
    await expect(h.service.buildingContact(building)).resolves.toEqual({ phone: managerContact.phone, zaloUrl: null, facebookUrl: null });
    building.manager = { isActive: false, contactPhone: managerContact.phone, zaloUrl: null, facebookUrl: null };
    await expect(h.service.buildingContact(building)).resolves.toEqual(bossContact);
    expect(h.getDefaultContact).toHaveBeenCalledTimes(3);
  });

  it('BLD-04: resolver needs no login phone or user id and never adds date or money fields', async () => {
    const h = setup();
    const result = await h.service.buildingContact({ manager: { isActive: true, contactPhone: managerContact.phone, zaloUrl: null, facebookUrl: null } });
    expect(result).toEqual({ phone: managerContact.phone, zaloUrl: null, facebookUrl: null });
    expect(Object.keys(result ?? {}).sort()).toEqual(['facebookUrl', 'phone', 'zaloUrl']);
  });

  it('BLD-04: BuildingsModule injects and exports BuildingContactService with SettingsModule', async () => {
    const fallback = { phone: '0900000001', zaloUrl: null, facebookUrl: null };
    const moduleRef = await Test.createTestingModule({ imports: [BuildingsModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(SettingsService).useValue({ getDefaultContact: vi.fn(async () => fallback) })
      .compile();
    try {
      const resolver = moduleRef.get(BuildingContactService);
      await expect(resolver.buildingContact({ manager: null })).resolves.toEqual(fallback);
      expect(Reflect.getMetadata('exports', BuildingsModule)).toContain(BuildingContactService);
    } finally {
      await moduleRef.close();
    }
  });
});
