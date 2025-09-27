import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: (req) => {
        if (req && req.cookies) {
          return req.cookies['refreshToken'];
        }
        return null;
      },
      secretOrKey: configService.get<string>('ADMIN_JWT_REFRESH_SECRET'),
    });
  }

  async validate(payload: any) {
    return {
      id: payload.id,
      username: payload.username,
    };
  }
}
