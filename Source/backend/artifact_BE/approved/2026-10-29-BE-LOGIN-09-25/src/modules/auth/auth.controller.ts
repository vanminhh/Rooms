import { Body, Controller, Get, Headers, HttpCode, Ip, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AllowPasswordChangeRequired,
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '../../common/guards/auth.decorators.js';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto, UpdateMeDto } from './dto/auth.dto.js';
import { AuthService, type IssuedSession, type Me } from './auth.service.js';

export const REFRESH_COOKIE = 'rt';

// Same options for set and clear, or the browser keeps the old cookie.
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/v1/auth',
});

// cookie-parser can turn a "j:" cookie into an object; only a string is a token.
const refreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
};

// remember = persistent cookie until the session expires; otherwise a browser-session cookie.
const setRefreshCookie = (res: Response, s: IssuedSession): void => {
  res.cookie(REFRESH_COOKIE, s.token, s.remember ? { ...cookieOptions(), expires: s.expiresAt } : cookieOptions());
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: Me }> {
    const { accessToken, user, session } = await this.auth.login(dto, userAgent);
    setRefreshCookie(res, session);
    return { accessToken, user };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const { accessToken, session } = await this.auth.refresh(refreshCookie(req), userAgent);
    setRefreshCookie(res, session);
    return { accessToken };
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    await this.auth.logout(refreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    return null;
  }

  @Roles('BOSS', 'MANAGER', 'TENANT')
  @AllowPasswordChangeRequired()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.auth.getMe(user.id);
  }

  @Roles('BOSS', 'MANAGER', 'TENANT')
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<Me> {
    return this.auth.updateMe(user, dto);
  }

  @Roles('BOSS', 'MANAGER', 'TENANT')
  @AllowPasswordChangeRequired()
  @HttpCode(200)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<null> {
    await this.auth.changePassword(user, dto, refreshCookie(req), ip);
    return null;
  }

  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<null> {
    await this.auth.forgotPassword(dto);
    return null;
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string): Promise<null> {
    await this.auth.resetPassword(dto, ip);
    return null;
  }
}
