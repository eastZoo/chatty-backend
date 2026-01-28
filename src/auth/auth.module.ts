import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from 'src/entities/users.entity';
import { LocalStrategy } from './strategies/local.strategy';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { RedisService } from './redis.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AccessTokenGuard } from './guards/access-token.guard';
import { AdminGuard } from './guards/admin.guard';
import { FcmToken } from 'src/entities/fcm-token.entity';

@Module({
  controllers: [AuthController],
  imports: [TypeOrmModule.forFeature([Users, FcmToken])],
  providers: [
    LocalStrategy,
    JwtService,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    RedisService,
    JwtAuthGuard,
    AccessTokenGuard,
    AdminGuard,
    AuthService,
  ],
  exports: [
    RedisService,
    JwtAuthGuard,
    AccessTokenGuard,
    AdminGuard,
    JwtService,
    AuthService,
  ],
})
export class AuthModule {}
