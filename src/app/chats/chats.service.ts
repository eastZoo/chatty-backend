// src/chats/chats.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat, ChatType } from '../../entities/chat.entity';
import { Repository } from 'typeorm';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { Users } from '../../entities/users.entity';
import { TokenUserInfo } from 'src/types/requestWithUser.types';
import { Message } from 'src/entities/message.entity';
import { PrivateChat } from 'src/entities/private-chat.entity';
import { ChatReadStatus } from 'src/entities/chat-read-status.entity';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(Chat)
    private chatsRepository: Repository<Chat>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(PrivateChat)
    private privateChatRepository: Repository<PrivateChat>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
  ) {}

  /**
   * 그룹 채팅방 생성
   *  */
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
  async update(
    id: string,
    updateChatDto: UpdateChatDto,
    user: Users,
  ): Promise<Chat> {
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

  // 단체톡방 단순 채팅방 조회 (존재 여부만 체크)
  async findById(chatId: string): Promise<Chat> {
    const chat = await this.chatsRepository.findOne({ where: { id: chatId } });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    return chat;
  }

  // 1:1 채팅방 단순 조회 (존재 여부만 체크)
  async findPrivateChatById(chatId: string): Promise<PrivateChat> {
    const chat = await this.privateChatRepository.findOne({
      where: { id: chatId },
    });
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }
    return chat;
  }

  /**
   * 1:1 채팅방 생성 또는 조회
   *  */
  async getOrCreatePrivateChat(
    user: TokenUserInfo,
    createChatDto: CreateChatDto,
  ): Promise<PrivateChat> {
    let newChat: PrivateChat;

    if (!createChatDto.friendId) {
      throw new BadRequestException('FriendId is required for private chat');
    }

    console.log('user', user);
    console.log('createChatDto', createChatDto);

    // Fetch the existing chat if any
    const existingChat = await this.privateChatRepository
      .createQueryBuilder('privateChat')
      .where(
        '(privateChat.userA = :userId AND privateChat.userB = :friendId) OR (privateChat.userA = :friendId AND privateChat.userB = :userId)',
        { userId: user.id, friendId: createChatDto.friendId },
      )
      .getOne();

    console.log('existingChat', existingChat);

    if (existingChat) {
      return { ...existingChat, type: 'private' } as PrivateChat;
    } else {
      console.log('no existingChat');
      // If no existing chat, create a new one
      newChat = this.privateChatRepository.create({
        userA: user,
        userB: { id: createChatDto.friendId } as Users,
      });
      console.log('newChat', newChat);
    }

    try {
      const savedChat = await this.privateChatRepository.save(newChat);
      console.log('savedChat', savedChat);
      return { ...savedChat, type: 'private' } as PrivateChat;
    } catch (error) {
      throw new InternalServerErrorException('Error creating private chat');
    }
  }

  /**
   * 1:1 채팅방 목록 조회
   *  */
  async getPrivateChats(user: TokenUserInfo): Promise<any[]> {
    const chats = await this.privateChatRepository
      .createQueryBuilder('privateChat')
      .leftJoinAndSelect('privateChat.userA', 'userA')
      .leftJoinAndSelect('privateChat.userB', 'userB')
      .leftJoinAndSelect('privateChat.messages', 'message')
      .where('privateChat.userA = :userId OR privateChat.userB = :userId', {
        userId: user.id,
      })
      .orderBy('privateChat.updatedAt', 'DESC')
      .getMany();

    return chats.map((chat) => {
      const otherUser = chat.userA.id === user.id ? chat.userB : chat.userA;
      let lastMessage = '';
      if (chat.messages && chat.messages.length > 0) {
        chat.messages.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        lastMessage = chat.messages[chat.messages.length - 1].content;
      }
      return {
        id: chat.id,
        otherUser,
        lastMessage,
        updatedAt: chat.updatedAt,
      };
    });
  }

  /**
   * 1:1 메시지 생성
   *  */
  async createPrivateMessage(
    roomId: string,
    content: string,
    senderId: string,
  ): Promise<Message> {
    // PrivateChat 객체 조회
    const privateChat = await this.privateChatRepository.findOne({
      where: { id: roomId },
      relations: ['messages'],
    });
    if (!privateChat) {
      throw new BadRequestException('Private chat not found');
    }
    // sender 정보 조회 (생략 가능: 클라이언트에서 sender 정보를 같이 보낼 수도 있음)
    const sender = await this.usersRepository.findOne({
      where: { id: senderId },
    });
    if (!sender) {
      throw new BadRequestException('Sender not found');
    }
    const message = this.messageRepository.create({
      content,
      sender,
      privateChat,
    });
    return this.messageRepository.save(message);
  }
}
