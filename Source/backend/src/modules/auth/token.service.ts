import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { credentialVersion } from '../../common/crypto/credential-version.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 minutes, AUTH-T1
export const REFRESH_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // AUTH-T2
export const REFRESH_TTL_SESSION_MS = 12 * 60 * 60 * 1000; // A-07

export interface AccessPayload {
  sub: string;
  role: Role;
  cv: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  // The secret is read per call, not when the module is built, so a test can set it first.
  async signAccessToken(user: { id: number; role: Role; passwordHash?: string }): Promise<string> {
    // Authentication passes the exact snapshot that authorized its session. Reading a newer
    // hash here could bless an old login that raced with a staff password reset (AUTH-T3).
    const passwordHash = user.passwordHash ?? (await this.prisma.user.findUnique({
      where: { id: user.id }, select: { passwordHash: true },
    }))?.passwordHash ?? '';
    const payload: AccessPayload = {
      sub: String(user.id), role: user.role, cv: credentialVersion(user.id, passwordHash),
    };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  // Throws on a bad signature, an expired token or any algorithm other than HS256.
  async verifyAccessToken(token: string): Promise<AccessPayload> {
    const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
      secret: process.env.JWT_SECRET,
      algorithms: ['HS256'],
    });
    if (typeof payload.cv !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.cv)) {
      throw new Error('Invalid access credential version');
    }
    return payload;
  }

  // Plain ms arithmetic: no calendar or timezone math (AUTH-T2, A-07).
  refreshExpiresAt(remember: boolean, now: Date = new Date()): Date {
    return new Date(now.getTime() + (remember ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SESSION_MS));
  }
}
