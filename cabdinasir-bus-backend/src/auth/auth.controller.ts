import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ChangePhoneDto, LoginDto, RefreshDto } from './auth.dto';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser } from '../common/auth-user';

const COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.login(dto.phone, dto.password, req.ip);
    this.setCookie(res, t.refreshToken, t.refreshExpiresAt);
    return t;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.refresh(dto.refreshToken ?? req.cookies?.[COOKIE]);
    this.setCookie(res, t.refreshToken, t.refreshExpiresAt);
    return t;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** Ka bax qalab kasta (taleefan lumay, password la xaday) */
  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeAll(user.id);
    res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  }

  /** Wuxuu soo celiyaa tokens cusub (qalabka kale oo dhan waa laga saaray). */
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    this.setCookie(res, t.refreshToken, t.refreshExpiresAt);
    return t;
  }

  /** Taleefanka login-ka beddel (password-ka hadda waajib) → tokens cusub, qalabka kale waa laga saaray */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-phone')
  @HttpCode(200)
  async changePhone(@CurrentUser() user: AuthUser, @Body() dto: ChangePhoneDto, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.changePhone(user.id, dto.currentPassword, dto.newPhone);
    this.setCookie(res, t.refreshToken, t.refreshExpiresAt);
    return t;
  }

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires,
    });
  }
}
