// src/messages/messages.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Message } from '../../entities/message.entity';
import { Repository } from 'typeorm';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatsService } from '../chats/chats.service';
import { Users } from '../../entities/users.entity';
import { ChatGateway } from '../../chat.gateway';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
    private chatsService: ChatsService,
    private chatGateway: ChatGateway, // 주입
  ) {}

  async findAllByChat(chatId: string): Promise<Message[]> {
    await this.chatsService.findById(chatId);
    return this.messagesRepository.find({
      where: { chat: { id: chatId } },
      order: { createdAt: 'ASC' },
    });
  }

  async create(chatId: string, createMessageDto: CreateMessageDto, user: Users): Promise<Message> {
  const chat = await this.chatsService.findById(chatId);
  if (!chat) {
    throw new NotFoundException('Chat not found');
  }

  const message = this.messagesRepository.create({
    content: createMessageDto.content,
    chat: chat,
    sender: user,
  });

  // 메시지를 저장합니다.
  const savedMessage = await this.messagesRepository.save(message);

  // 저장된 메시지를 다시 조회해 sender 정보까지 포함한 완전한 메시지를 반환합니다.
  const fullMessage = await this.messagesRepository.findOne({
    where: { id: savedMessage.id },
    relations: ['sender', 'chat'],  // sender의 전체 정보와 chat 관계를 가져옵니다.
  });

// 여기서는 브로드캐스트를 하지 않고, chat.gateway.ts.의  handleSendMessage에서만 브로드캐스트하도록 합니다.
  return fullMessage;
}
}
