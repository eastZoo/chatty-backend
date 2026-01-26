import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Authorization 헤더에서 추출
      secretOrKey: process.env.ADMIN_JWT_SECRET,
    });
  }

  async validate(payload: any) {
    Logger.log('USER', payload.username);
    return {
      id: payload.id,
      username: payload.username,
      type: payload.type || 'USER',
    };
  }
}
