import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

@Module({
  controllers: [AuthController],
  imports: [TypeOrmModule.forFeature([Users])],
  providers: [
    LocalStrategy,
    JwtService,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    RedisService,
    JwtAuthGuard,
    AccessTokenGuard,
    AuthService,
  ],
  exports: [
    RedisService,
    JwtAuthGuard,
    AccessTokenGuard,
    JwtService,
    AuthService,
  ], // 다른 모듈에서 사용 가능하도록 export
})
export class AuthModule {}
