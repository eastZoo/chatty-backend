// src/messages/messages.controller.ts
import { Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';

@Controller('chats/:chatId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @UseGuards(AccessTokenGuard)
  @Get()
  async findAll(@Param('chatId') chatId: string) {
    return this.messagesService.findAllByChat(chatId);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async create(@Param('chatId') chatId: string, @Body() createMessageDto: CreateMessageDto, @Req() req) {
    return this.messagesService.create(chatId, createMessageDto, req.user);
  }
}
