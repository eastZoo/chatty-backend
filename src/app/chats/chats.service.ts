// src/chats/chats.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Chat } from '../../entities/chat.entity';
import { Repository } from 'typeorm';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { Users } from '../../entities/users.entity';
import { TokenUserInfo } from 'src/types/requestWithUser.types';
import { Message } from 'src/entities/message.entity';
import { PrivateChat } from 'src/entities/private-chat.entity';
import { ChatReadStatus } from 'src/entities/chat-read-status.entity';
import { ChatReadDto } from './dto/chat-read.dto';
import { FilesService } from '../files/files.service';
import { Inject, forwardRef } from '@nestjs/common';
import { FcmToken } from 'src/entities/fcm-token.entity';
import * as admin from 'firebase-admin';

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
    @InjectRepository(ChatReadStatus)
    private chatReadStatusRepository: Repository<ChatReadStatus>,
    @InjectRepository(FcmToken)
    private fcmTokenRepository: Repository<FcmToken>,
    @Inject(forwardRef(() => FilesService))
    private filesService: FilesService,
    @Inject('FIREBASE_ADMIN')
    private readonly firebaseAdmin: typeof admin,
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
  async update(id: string, updateChatDto: UpdateChatDto): Promise<Chat> {
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

  // Chat의 updated_at 업데이트
  async updateChatUpdatedAt(chatId: string): Promise<void> {
    await this.chatsRepository.update(chatId, {
      updatedAt: new Date(),
    });
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

    // Fetch the existing chat if any
    const existingChat = await this.privateChatRepository
      .createQueryBuilder('privateChat')
      .where(
        '(privateChat.userA = :userId AND privateChat.userB = :friendId) OR (privateChat.userA = :friendId AND privateChat.userB = :userId)',
        { userId: user.id, friendId: createChatDto.friendId },
      )
      .getOne();

    if (existingChat) {
      return { ...existingChat, type: 'private' } as PrivateChat;
    } else {
      // If no existing chat, create a new one
      newChat = this.privateChatRepository.create({
        userA: user,
        userB: { id: createChatDto.friendId } as Users,
      });
    }

    try {
      const savedChat = await this.privateChatRepository.save(newChat);

      return { ...savedChat, type: 'private' } as PrivateChat;
    } catch (error) {
      throw new InternalServerErrorException('Error creating private chat');
    }
  }

  /**
   * 1:1 채팅방 목록 조회
   *  */
  async getPrivateChats(user: TokenUserInfo): Promise<any[]> {
    console.log('user.id', user.id);
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

    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        // 상대방 정보 추출
        const otherUser = chat.userA.id === user.id ? chat.userB : chat.userA;
        // 마지막 메시지 추출 (없으면 빈 문자열)
        let lastMessage = '';
        if (chat.messages && chat.messages.length > 0) {
          chat.messages.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
          lastMessage = chat.messages[chat.messages.length - 1].content;
        }
        // 읽지 않은 메시지 개수 계산:
        // ChatReadStatus에서 현재 사용자의 마지막 읽은 시각을 가져옵니다.
        const chatType: 'group' | 'private' = (chat as any).type || 'private';
        const readStatus = await this.chatReadStatusRepository.findOne({
          where: { chatId: chat.id, chatType: chatType, user: { id: user.id } },
        });
        console.log('readStatus', readStatus);
        const lastReadAt = readStatus ? readStatus.lastReadAt : new Date(0);
        // 해당 채팅방(privateChat)에 대해, 현재 사용자가 보낸 메시지가 아닌, lastReadAt 이후의 메시지 수를 구합니다.

        const unreadCount = await this.messageRepository
          .createQueryBuilder('message')
          .where('message.private_chat_id = :chatId', { chatId: chat.id })
          .andWhere('message.sender_id != :userId', { userId: user.id })
          .andWhere('message.created_at > :lastReadAt', { lastReadAt })
          .getCount();

        console.log('unreadCount', unreadCount);
        return {
          id: chat.id,
          otherUser,
          lastMessage,
          unreadCount,
          updatedAt: chat.updatedAt,
        };
      }),
    );
    return chatsWithUnread;
  }

  /**
   * 1:1 메시지 생성
   *  */
  async createPrivateMessage(
    roomId: string,
    content: string,
    senderId: string,
    replyTargetId?: string,
    fileIds?: string[],
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
      replyTarget: {
        id: replyTargetId || null,
      },
      fileIds: fileIds || null,
    });

    // 메시지 저장
    const savedMessage = await this.messageRepository.save(message);

    // PrivateChat의 updated_at 업데이트
    await this.privateChatRepository.update(
      {
        id: roomId,
      },
      {
        updatedAt: new Date(),
      },
    );

    // 저장된 메시지를 다시 조회해 sender 정보와 파일 정보까지 포함한 완전한 메시지를 반환합니다.
    const fullMessage = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sender', 'privateChat', 'replyTarget'], // sender와 privateChat 관계 포함
    });

    // 파일 정보 추가
    if (fullMessage.fileIds && fullMessage.fileIds.length > 0) {
      try {
        const files = await Promise.all(
          fullMessage.fileIds.map(async (fileId) => {
            try {
              const file = await this.filesService.getFileById(fileId);
              return {
                id: file.id,
                originalName: file.originalName,
                filename: file.filename,
                mimetype: file.mimetype,
                size: file.size,
                url: file.url,
                downloadUrl: `/files/download/${file.id}`,
              };
            } catch (error) {
              return null;
            }
          }),
        );
        fullMessage.files = files.filter((file) => file !== null);
      } catch (error) {
        fullMessage.files = [];
      }
    } else {
      fullMessage.files = [];
    }

    return fullMessage;
  }

  /** 주어진 채팅방에 대해 사용자의 마지막 읽은 시각을 업데이트합니다. */
  async markChatAsRead(user: TokenUserInfo, chat: ChatReadDto): Promise<void> {
    // 그룹 채팅은 Chat 엔티티, 1:1 채팅은 PrivateChat 엔티티
    // PrivateChat 엔티티에서는 getOrCreatePrivateChat 메서드에서 type을 'private'으로 추가했다고 가정합니다.
    console.log('chat', chat);

    const chatType: 'group' | 'private' = chat.chatType || 'group';
    const chatId = chat.id;

    console.log('chatType', chatType);
    console.log('chatId', chatId);

    // 채팅 읽음 상태 업데이트 ( chat과 chatType을 통해 채팅 읽음 상태 업데이트)
    let readStatus = await this.chatReadStatusRepository.findOne({
      where: { chatId: chatId, chatType: chatType, user: { id: user.id } },
    });

    Logger.log('readStatus', readStatus);
    if (readStatus) {
      Logger.log('readStatus 존재');
      console.log('readStatus', readStatus);
      // readStatus.lastReadAt = new Date();
      // new Date()로 업데이트하면 디비 시간과 클라이언트 시간이 다르므로, 삭제합니다.
      delete readStatus.lastReadAt;

      // 이미 해당 채팅방에 대한 읽음 상태가 있으면, 그상태의 시간만 업데이트합니다.
      await this.chatReadStatusRepository.update(readStatus.id, readStatus);
    } else {
      readStatus = this.chatReadStatusRepository.create({
        chatId: chatId,
        chatType: chatType,
        user: user,
        // lastReadAt: new Date(),
      });
      await this.chatReadStatusRepository.save(readStatus);
    }
  }

  /**
   * PUSH 알람 발송
   */
  async sendPushAlarms(data: {
    chatId: string;
    content: string;
    userId: string; // 메시지 보낸 사람
  }) {
    try {
      // 1️⃣ 채팅방 조회
      const { userA, userB } = await this.privateChatRepository.findOne({
        where: { id: data.chatId },
      });

      if (!userA || !userB) return;

      // 2️⃣ 받는 사람 결정 (보낸 사람 제외)
      const targetUserId = data.userId === userA.id ? userB.id : userA.id;

      if (!targetUserId) return;

      const tokens = await this.fcmTokenRepository.find({
        where: { user: { id: targetUserId } },
      });

      if (tokens.length === 0) return;

      const registrationTokens = tokens.map((t) => t.token);

      const message: admin.messaging.MulticastMessage = {
        tokens: registrationTokens,
        notification: {
          title: 'Chatty',
          body: '새로운 메세지가 있습니다.',
        },
        data: {
          type: 'chat',
        },
      };

      // 3️⃣ Push 발송
      const response = await admin.messaging().sendEachForMulticast(message);

      // 4️⃣ 실패한 토큰 정리
      const failedTokens: string[] = [];

      response.responses.forEach((res, idx) => {
        if (!res.success) {
          failedTokens.push(registrationTokens[idx]);
        }
      });

      if (failedTokens.length > 0) {
        await this.fcmTokenRepository.delete({
          token: failedTokens as any,
        });
      }
    } catch (error) {
      console.log('!! SEND ERROR: ', error);
      throw new InternalServerErrorException('Error Push Alarms');
    }
  }
}
