import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AccessTokenGuard extends AuthGuard('jwt') {}

// 새로운 JWT Guard 사용을 위한 별칭
export { JwtAuthGuard as NewJwtAuthGuard } from './jwt-auth.guard';
