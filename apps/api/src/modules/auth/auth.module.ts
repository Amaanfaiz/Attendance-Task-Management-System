import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy],
  exports: [TokensService, AuthService],
})
export class AuthModule {}
