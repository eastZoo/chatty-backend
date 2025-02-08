import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
   constructor() {
    super({
      jwtFromRequest: (req) => {
        if (req && req.cookies) {
          return req.cookies['refreshToken'];
        }
        return null;
      },
      secretOrKey: process.env.ADMIN_JWT_REFRESH_SECRET, // 실제 시크릿 키로 변경
    });
  }

  async validate(payload: any) {
    return {
      id: payload.id,
      username: payload.username,
    };
  }
}
