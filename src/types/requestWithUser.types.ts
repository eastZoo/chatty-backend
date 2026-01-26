import { Request } from 'express';
import { Users } from 'src/entities/users.entity';

export interface RequestWithUser extends Request {
  user: TokenUserInfo;
}

export interface TokenUserInfo {
  id: Users['id'];
  username: Users['username'];
  type: string; // 'USER' | 'ADMIN'
}
