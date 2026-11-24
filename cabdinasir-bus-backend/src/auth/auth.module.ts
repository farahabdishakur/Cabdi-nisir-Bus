import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserStatusCache } from './user-status.cache';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, UserStatusCache],
  exports: [AuthService, JwtModule, UserStatusCache],
})
export class AuthModule {}
