import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.js';
import type { PublicContact } from '../settings/settings.service.js';

export interface BuildingContactSource {
  manager: {
    isActive: boolean;
    contactPhone: string | null;
    zaloUrl: string | null;
    facebookUrl: string | null;
  } | null;
}

@Injectable()
export class BuildingContactService {
  constructor(private readonly settings: SettingsService) {}

  async buildingContact(building: BuildingContactSource): Promise<PublicContact | null> {
    const manager = building.manager;
    if (manager?.isActive && manager.contactPhone) {
      return {
        phone: manager.contactPhone,
        zaloUrl: manager.zaloUrl,
        facebookUrl: manager.facebookUrl,
      };
    }
    return this.settings.getDefaultContact();
  }
}
