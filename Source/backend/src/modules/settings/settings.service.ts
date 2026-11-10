import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export interface PublicContact {
  phone: string | null;
  zaloUrl: string | null;
  facebookUrl: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // AUTH-10, D-02: only the three public keys leave the server (P11).
  async getDefaultContact(): Promise<PublicContact | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'default_contact' } });
    if (!row) return null;
    const v = (typeof row.value === 'object' && row.value !== null && !Array.isArray(row.value)
      ? row.value
      : {}) as Record<string, unknown>;
    return { phone: str(v.phone), zaloUrl: str(v.zaloUrl), facebookUrl: str(v.facebookUrl) };
  }
}
