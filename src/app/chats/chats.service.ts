// src/chats/chats.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat } from '../../entities/chat.entity';
import { Repository } from 'typeorm';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { Users } from '../../entities/users.entity';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(Chat)
    private chatsRepository: Repository<Chat>,
  ) {}

  async create(createChatDto: CreateChatDto, user: Users): Promise<Chat> {
    const chat = this.chatsRepository.create({
      title: createChatDto.title || 'New Chat',
      user: user, // 작성자 정보 저장 (정보 제공용)
    });
    return this.chatsRepository.save(chat);
  }

  // 모든 채팅방 조회 (작성자와 상관없이)
  async findAll(): Promise<Chat[]> {
    return this.chatsRepository.find();
  }

  // 채팅방 업데이트 – 필요 시 원래 채팅방 작성자만 업데이트하도록 제한할 수 있음
  async update(id: string, updateChatDto: UpdateChatDto, user: Users): Promise<Chat> {
    const chat = await this.chatsRepository.findOne({ where: { id } });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    // (옵션) 작성자 본인만 제목 수정하도록 제한할 수도 있습니다.
    // if (chat.user.id !== user.id) {
    //   throw new UnauthorizedException('Only the chat creator can update the title');
    // }
    chat.title = updateChatDto.title;
    return this.chatsRepository.save(chat);
  }

  // 단순 채팅방 조회 (존재 여부만 체크)
  async findById(chatId: string): Promise<Chat> {
    const chat = await this.chatsRepository.findOne({ where: { id: chatId } });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    return chat;
  }
}
