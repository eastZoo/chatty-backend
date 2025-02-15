import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Param,
  UseGuards,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { Request } from 'express';
import {
  RequestWithUser,
  TokenUserInfo,
} from 'src/types/requestWithUser.types';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('request')
  @UseGuards(AccessTokenGuard)
  async sendFriendRequest(
    @Req() req: RequestWithUser,
    @Body('receiverId') receiverId: string,
  ) {
    const requester = req.user; // 인증 미들웨어에 의해 설정된 값
    return this.friendsService.sendFriendRequest(requester, receiverId);
  }

  @Post('accept/:requestId')
  @UseGuards(AccessTokenGuard)
  async acceptFriendRequest(
    @Req() req: RequestWithUser,
    @Param('requestId') requestId: number,
  ) {
    const user = req.user;
    return this.friendsService.acceptFriendRequest(requestId, user);
  }

  @Post('reject/:requestId')
  @UseGuards(AccessTokenGuard)
  async rejectFriendRequest(
    @Req() req: RequestWithUser,
    @Param('requestId') requestId: number,
  ) {
    const user = req.user;
    return this.friendsService.rejectFriendRequest(requestId, user);
  }

  @Get('requests')
  @UseGuards(AccessTokenGuard)
  async getFriendRequests(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.friendsService.getFriendRequests(user);
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  async getFriends(@Req() req: RequestWithUser) {
    const user = req.user;
    return this.friendsService.getFriends(user);
  }
}
