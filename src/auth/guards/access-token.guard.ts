import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from '../auth.service';
import { RedisService } from '../redis.service';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  private readonly logger = new Logger(AccessTokenGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Authorization 헤더에서 토큰 추출
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('토큰이 없습니다.');
    }

    const token = authHeader.substring(7); // 'Bearer ' 제거
    this.logger.log(`🔍 AccessTokenGuard: 토큰 검증 시작`);

    try {
      // 토큰 검증
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
      });

      // 토큰 만료 시간 확인
      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp;
      const remainingTime = exp - now;

      this.logger.log(
        `✅ AccessTokenGuard: 토큰 검증 성공 - 사용자: ${payload.username}, 남은 시간: ${remainingTime}초`,
      );

      // Redis에서 강제 로그아웃 확인
      const refreshToken = await this.redisService.getRefreshToken(payload.id);
      if (!refreshToken) {
        this.logger.warn(
          `🚫 AccessTokenGuard: 강제 로그아웃된 사용자 접근 시도: ${payload.username}`,
        );
        throw new UnauthorizedException('강제 로그아웃된 사용자입니다.');
      }

      // Redis TTL 갱신 (7일 연장)
      await this.redisService.refreshTokenTTL(payload.id);
      this.logger.log(
        `🔄 AccessTokenGuard: Redis TTL 갱신 완료 - 사용자: ${payload.username}`,
      );

      // 토큰이 유효하면 사용자 정보를 request에 추가
      request.user = payload;
      return true;
    } catch (error) {
      // 토큰이 만료되었거나 유효하지 않은 경우
      this.logger.warn(`❌ AccessTokenGuard: 토큰 검증 실패: ${error.message}`);

      // Refresh Token으로 새로운 Access Token 발급 시도
      try {
        const refreshToken = request.cookies['chatty_refreshToken'];
        if (!refreshToken) {
          throw new UnauthorizedException('Refresh Token이 없습니다.');
        }

        this.logger.log(
          `🔄 AccessTokenGuard: Refresh Token으로 토큰 재발급 시도`,
        );

        // Redis에서 Refresh Token 유효성 확인
        const storedRefreshToken = await this.redisService.getRefreshToken(
          this.extractUserIdFromRefreshToken(refreshToken),
        );

        if (!storedRefreshToken || storedRefreshToken !== refreshToken) {
          throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.');
        }

        // 새로운 Access Token 발급 (Refresh Token은 재발급하지 않음)
        const newAccessToken = await this.authService.generateAccessToken(
          this.extractUserIdFromRefreshToken(refreshToken),
        );

        this.logger.log(`✅ AccessTokenGuard: 새로운 Access Token 발급 성공`);

        // 응답 헤더에 새로운 Access Token 추가
        response.header('x-access-token', newAccessToken);
        console.log(
          `📤 AccessTokenGuard: x-access-token 헤더 설정 완료 - 토큰 길이: ${newAccessToken.length}`,
        );

        // Redis TTL 갱신 (7일 연장)
        await this.redisService.refreshTokenTTL(
          this.extractUserIdFromRefreshToken(refreshToken),
        );

        this.logger.log(
          `🔄 AccessTokenGuard: Redis TTL 갱신 완료 (토큰 재발급 후)`,
        );

        // 새로운 토큰으로 사용자 정보 추출
        const newPayload = this.jwtService.verify(newAccessToken, {
          secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
        });

        request.user = newPayload;
        return true;
      } catch (refreshError) {
        this.logger.error(
          `❌ AccessTokenGuard: 토큰 재발급 실패: ${refreshError.message}`,
        );
        throw new UnauthorizedException(
          '토큰이 만료되었습니다. 다시 로그인해주세요.',
        );
      }
    }
  }

  private extractUserIdFromRefreshToken(refreshToken: string): string {
    try {
      const payload = this.jwtService.decode(refreshToken) as any;
      return payload?.id;
    } catch {
      return null;
    }
  }
}
