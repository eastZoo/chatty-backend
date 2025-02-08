// src/chats/chats.controller.ts
import { Controller, Get, Post, Patch, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';

@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

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
  async update(@Param('id') id: string, @Body() updateChatDto: UpdateChatDto, @Req() req) {
    return this.chatsService.update(id, updateChatDto, req.user);
  }
}
