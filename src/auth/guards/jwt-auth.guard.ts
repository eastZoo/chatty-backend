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

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
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
    console.log('@@token', token);
    try {
      // 토큰 검증
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
      });

      console.log('payload', payload);

      // 토큰이 유효하면 사용자 정보를 request에 추가
      request.user = payload;
      return true;
    } catch (error) {
      // 토큰이 만료되었거나 유효하지 않은 경우
      this.logger.warn(`토큰 검증 실패: ${error.message}`);

      // Refresh Token으로 새로운 Access Token 발급 시도
      try {
        const refreshToken = request.cookies['chatty_refreshToken'];
        if (!refreshToken) {
          throw new UnauthorizedException('Refresh Token이 없습니다.');
        }

        // 새로운 Access Token 발급
        const newAccessToken =
          await this.authService.refreshAccessToken(refreshToken);

        // 응답 헤더에 새로운 Access Token 추가
        response.header('x-access-token', newAccessToken);

        // 새로운 토큰으로 사용자 정보 추출
        const newPayload = this.jwtService.verify(newAccessToken, {
          secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
        });

        request.user = newPayload;
        return true;
      } catch (refreshError) {
        this.logger.error(`토큰 재발급 실패: ${refreshError.message}`);
        throw new UnauthorizedException(
          '토큰이 만료되었습니다. 다시 로그인해주세요.',
        );
      }
    }
  }
}
