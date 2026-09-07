import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@atms/shared';
import { Public } from '../../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from './cookie.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput) {
    return this.authService.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateCredentials(body);
    const { accessToken, refreshToken } =
      await this.authService.issueSessionTokens(
        user.id,
        user.email,
        user.role,
        user.status,
      );
    setAuthCookies(res, this.config, accessToken, refreshToken);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await this.authService.refresh(token);
    setAuthCookies(res, this.config, accessToken, refreshToken);
    return { message: 'Session refreshed' };
  }

  // Public: logout's only job is revoking the refresh cookie, which the handler reads
  // directly — it must not depend on a still-valid access token, or a client whose
  // access token already expired (but whose refresh token hasn't) could never
  // successfully log out via a direct call to this endpoint.
  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    await this.authService.logout(token);
    clearAuthCookies(res, this.config);
    return { message: 'Logged out' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  forgotPassword(@Body() body: ForgotPasswordInput) {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  resetPassword(@Body() body: ResetPasswordInput) {
    return this.authService.resetPassword(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
