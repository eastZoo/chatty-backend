import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: (req) => {
        if (req && req.cookies) {
          return req.cookies['accessToken'];
        }
        return null;
      },
      secretOrKey: process.env.ADMIN_JWT_SECRET, // 실제 시크릿 키로 변경
    });
  }

  async validate(payload: any) {
    Logger.log('USER', payload.username);
    return {
      id: payload.id,
      username: payload.username,
    };
  }
}
