// src/chats/chats.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
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

  async canUserAccessChat(
    chatId: string,
    chatType: 'group' | 'private',
    userId: string,
  ): Promise<boolean> {
    if (chatType === 'private') {
      return this.privateChatRepository
        .createQueryBuilder('privateChat')
        .leftJoin('privateChat.userA', 'userA')
        .leftJoin('privateChat.userB', 'userB')
        .where('privateChat.id = :chatId', { chatId })
        .andWhere('(userA.id = :userId OR userB.id = :userId)', { userId })
        .getExists();
    }

    return this.chatsRepository
      .createQueryBuilder('chat')
      .leftJoin('chat.user', 'owner')
      .leftJoin('chat.participants', 'participant')
      .where('chat.id = :chatId', { chatId })
      .andWhere('(owner.id = :userId OR participant.id = :userId)', { userId })
      .getExists();
  }

  async canUserAccessAnyChat(chatId: string, userId: string): Promise<boolean> {
    if (await this.canUserAccessChat(chatId, 'private', userId)) return true;
    return this.canUserAccessChat(chatId, 'group', userId);
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
      .leftJoinAndSelect('privateChat.userA', 'userA')
      .leftJoinAndSelect('privateChat.userB', 'userB')
      .where(
        '(userA.id = :userId AND userB.id = :friendId) OR (userA.id = :friendId AND userB.id = :userId)',
        { userId: user.id, friendId: createChatDto.friendId },
      )
      .getOne();

    if (existingChat) {
      const friend =
        existingChat.userA.id === user.id
          ? existingChat.userB
          : existingChat.userA;

      return {
        ...existingChat,
        type: 'private',
        friendName: friend.username,
      } as PrivateChat;
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
    const chats = await this.privateChatRepository
      .createQueryBuilder('privateChat')
      .leftJoinAndSelect('privateChat.userA', 'userA')
      .leftJoinAndSelect('privateChat.userB', 'userB')
      .where('privateChat.userA = :userId OR privateChat.userB = :userId', {
        userId: user.id,
      })
      .orderBy('privateChat.updatedAt', 'DESC')
      .getMany();

    if (chats.length === 0) return [];

    const chatIds = chats.map((chat) => chat.id);
    const latestMessageId = this.messageRepository
      .createQueryBuilder('latestMessage')
      .select('latestMessage.id')
      .where('latestMessage.private_chat_id = message.private_chat_id')
      .orderBy('latestMessage.created_at', 'DESC')
      .addOrderBy('latestMessage.id', 'DESC')
      .limit(1)
      .getQuery();
    const lastReadAt = this.chatReadStatusRepository
      .createQueryBuilder('latestReadStatus')
      .select('MAX(latestReadStatus.lastReadAt)')
      .where('latestReadStatus.chatId = message.private_chat_id')
      .andWhere('latestReadStatus.chatType = :chatType')
      .andWhere('latestReadStatus.user = :userId')
      .getQuery();

    // Only retrieve one latest-message row per chat. Previously this endpoint
    // joined and sorted every historical message on every list refresh.
    const [latestMessages, unreadRows] = await Promise.all([
      this.messageRepository
        .createQueryBuilder('message')
        .select('message.private_chat_id', 'chatId')
        .addSelect('message.content', 'content')
        .addSelect('message.file_ids', 'fileIds')
        .where('message.private_chat_id IN (:...chatIds)', { chatIds })
        .andWhere(`message.id = (${latestMessageId})`)
        .getRawMany<{ chatId: string; content: string; fileIds: unknown }>(),
      this.messageRepository
        .createQueryBuilder('message')
        .select('message.private_chat_id', 'chatId')
        .addSelect('COUNT(message.id)', 'unreadCount')
        .where('message.private_chat_id IN (:...chatIds)', { chatIds })
        .andWhere('message.sender_id != :userId', { userId: user.id })
        .andWhere(`message.created_at > COALESCE((${lastReadAt}), :epoch)`, {
          chatType: 'private',
          userId: user.id,
          epoch: new Date(0),
        })
        .groupBy('message.private_chat_id')
        .getRawMany<{ chatId: string; unreadCount: string }>(),
    ]);

    const latestMessageByChat = new Map(
      latestMessages.map((message) => [message.chatId, message]),
    );
    const unreadCountByChat = new Map(
      unreadRows.map((row) => [row.chatId, Number(row.unreadCount)]),
    );

    return chats.map((chat) => {
      const latestMessage = latestMessageByChat.get(chat.id);
      const fileIds = latestMessage?.fileIds;
      const isFilesExist = Array.isArray(fileIds)
        ? fileIds.length > 0
        : typeof fileIds === 'string' && fileIds.length > 0;

      return {
        id: chat.id,
        otherUser: chat.userA.id === user.id ? chat.userB : chat.userA,
        lastMessage: latestMessage?.content ?? '',
        unreadCount: unreadCountByChat.get(chat.id) ?? 0,
        updatedAt: chat.updatedAt,
        isFilesExist,
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
    replyTargetId?: string,
    fileIds?: string[],
  ): Promise<Message> {
    // PrivateChat 객체 조회
    const [privateChat, sender] = await Promise.all([
      this.privateChatRepository.findOne({ where: { id: roomId } }),
      this.usersRepository.findOne({ where: { id: senderId } }),
    ]);
    if (!privateChat) {
      throw new BadRequestException('Private chat not found');
    }
    if (!sender) {
      throw new BadRequestException('Sender not found');
    }
    if (
      privateChat.userA.id !== senderId &&
      privateChat.userB.id !== senderId
    ) {
      throw new ForbiddenException('You are not a participant in this chat');
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

    // The saved entity already carries sender/privateChat. Only replies need a
    // follow-up relation query; ordinary sends avoid another DB round trip.
    const [, fullMessage] = await Promise.all([
      this.privateChatRepository.update(
        { id: roomId },
        { updatedAt: new Date() },
      ),
      replyTargetId
        ? this.messageRepository.findOne({
            where: { id: savedMessage.id },
            relations: ['sender', 'privateChat', 'replyTarget'],
          })
        : Promise.resolve(savedMessage),
    ]);

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
    const chatType: 'group' | 'private' = chat.chatType || 'group';
    const chatId = chat.id;
    await this.chatReadStatusRepository
      .createQueryBuilder()
      .insert()
      .into(ChatReadStatus)
      .values({
        chatId,
        chatType,
        user: { id: user.id },
        lastReadAt: new Date(),
      })
      .orUpdate(['last_read_at'], ['chat_id', 'chat_type', 'user_id'])
      .execute();
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

      const registrationTokens = [
        ...new Set(tokens.map((t) => t.token).filter(Boolean)),
      ];

      if (registrationTokens.length === 0) return;

      const message: admin.messaging.MulticastMessage = {
        tokens: registrationTokens,
        data: {
          type: 'chat',
          title: 'Chatty',
          body: '새로운 메시지가 있습니다.',
          chatId: data.chatId,
          url: '/chat',
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
