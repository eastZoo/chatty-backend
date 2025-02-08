import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  //   constructor(private readonly authService: AuthService) {
  //     super({ usernameField: 'userId' });
  //   }
  //   async validate(userId: string, password: string): Promise<any> {
  //     const user = await this.authService.validateUser(userId, password);
  //     if (!user) {
  //       throw new UnauthorizedException();
  //     }
  //     return user;
  //   }
}
