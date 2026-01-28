// src/chats/chats.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import { RequestWithUser } from 'src/types/requestWithUser.types';
import { ChatReadDto } from './dto/chat-read.dto';

@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  /**
   * 1:1 채팅방 생성 또는 조회
   *  */
  @Post('private')
  @UseGuards(AccessTokenGuard)
  async getOrCreatePrivateChat(
    @Req() req: RequestWithUser,
    @Body() createChatDto: CreateChatDto,
  ) {
    const user = req.user;
    return this.chatsService.getOrCreatePrivateChat(user, createChatDto);
  }

  /**
   * 1:1 채팅방 목록 조회
   *  */
  @Get('private/list')
  @UseGuards(AccessTokenGuard)
  async getPrivateChats(@Req() req: RequestWithUser) {
    const user = req.user;
    const chats = await this.chatsService.getPrivateChats(user);
    // 각 채팅방 객체에는 이미 otherUser, lastMessage, unreadCount가 포함되어 있습니다.
    return chats.map((chat) => ({
      id: chat.id,
      chatName: chat.otherUser ? chat.otherUser.username : '',
      otherUser: chat.otherUser,
      lastMessage: chat.lastMessage,
      unreadCount: chat.unreadCount,
      updatedAt: chat.updatedAt,
    }));
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async create(@Body() createChatDto: CreateChatDto, @Req() req) {
    return this.chatsService.create(createChatDto, req.user);
  }

  @UseGuards(AccessTokenGuard)
  @Get()
  async findAll() {
    return this.chatsService.findAll();
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateChatDto: UpdateChatDto,
    @Req() req,
  ) {
    return this.chatsService.update(id, updateChatDto, req.user);
  }

  // 채팅방 읽음 상태 업데이트 엔드포인트
  @Post('private/read')
  @UseGuards(AccessTokenGuard)
  async markChatAsRead(
    @Req() req: RequestWithUser,
    @Body()
    chat: ChatReadDto,
  ) {
    const user = req.user;
    await this.chatsService.markChatAsRead(user, chat);
    return { success: true };
  }
}
