import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';

export const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 minutes, AUTH-T1
export const REFRESH_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // AUTH-T2
export const REFRESH_TTL_SESSION_MS = 12 * 60 * 60 * 1000; // A-07

export interface AccessPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  // The secret is read per call, not when the module is built, so a test can set it first.
  signAccessToken(user: { id: number; role: Role }): Promise<string> {
    const payload: AccessPayload = { sub: String(user.id), role: user.role };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  // Throws on a bad signature, an expired token or any algorithm other than HS256.
  verifyAccessToken(token: string): Promise<AccessPayload> {
    return this.jwt.verifyAsync<AccessPayload>(token, {
      secret: process.env.JWT_SECRET,
      algorithms: ['HS256'],
    });
  }

  // Plain ms arithmetic: no calendar or timezone math (AUTH-T2, A-07).
  refreshExpiresAt(remember: boolean, now: Date = new Date()): Date {
    return new Date(now.getTime() + (remember ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SESSION_MS));
  }
}
