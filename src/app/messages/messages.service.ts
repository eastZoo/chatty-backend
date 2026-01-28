// src/messages/messages.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Message } from '../../entities/message.entity';
import { Repository } from 'typeorm';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatsService } from '../chats/chats.service';
import { Users } from '../../entities/users.entity';
import { ChatGateway } from '../../chat.gateway';
import { FilesService } from '../files/files.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
    @Inject(forwardRef(() => ChatsService))
    private chatsService: ChatsService,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway, // 주입
    @Inject(forwardRef(() => FilesService))
    private filesService: FilesService,
  ) {}

  async findAllByChat(
    chatId: string,
    chatType: 'group' | 'private',
  ): Promise<Message[]> {
    let chat;

    if (chatType === 'group') {
      chat = await this.chatsService.findById(chatId);
    } else if (chatType === 'private') {
      chat = await this.chatsService.findPrivateChatById(chatId);
    }

    if (!chat) {
      throw new NotFoundException(`${chatType} Chat not found`);
    }

    // Retrieve messages for the chat (group or private)
    const messages = await this.messagesRepository.find({
      where:
        chatType === 'group'
          ? { chat: { id: chat.id } }
          : { privateChat: { id: chat.id } },
      relations: ['sender', 'chat', 'privateChat'], // sender와 chat 관계 포함
      order: { createdAt: 'ASC' },
    });

    // 각 메시지의 파일 정보를 조회하여 추가
    const messagesWithFiles = await Promise.all(
      messages.map(async (message) => {
        if (message.fileIds && message.fileIds.length > 0) {
          try {
            const files = await Promise.all(
              message.fileIds.map(async (fileId) => {
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
                  // 파일을 찾을 수 없는 경우 null 반환
                  return null;
                }
              }),
            );
            // null 값 제거
            message.files = files.filter((file) => file !== null);
          } catch (error) {
            Logger.error(
              `Error fetching files for message ${message.id}:`,
              error,
            );
            message.files = [];
          }
        } else {
          message.files = [];
        }
        return message;
      }),
    );

    return messagesWithFiles;
  }

  /**
   * 최신 메시지를 limit 개수만큼 가져오기
   * @param chatId 채팅방 ID
   * @param chatType 채팅 타입 ('group' | 'private')
   * @param limit 가져올 메시지 수
   * @returns 메시지 배열 (최신순)
   */
  async findLatestByChat(
    chatId: string,
    chatType: 'group' | 'private',
    limit: number = 20,
  ): Promise<Message[]> {
    // 채팅방 존재 여부 확인
    let chat;
    if (chatType === 'group') {
      chat = await this.chatsService.findById(chatId);
    } else if (chatType === 'private') {
      chat = await this.chatsService.findPrivateChatById(chatId);
    }

    if (!chat) {
      throw new NotFoundException(`${chatType} Chat not found`);
    }

    // QueryBuilder를 사용하여 더 명확하고 안정적인 쿼리 작성
    const queryBuilder = this.messagesRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.chat', 'chat')
      .leftJoinAndSelect('message.privateChat', 'privateChat')
      .leftJoinAndSelect('message.replyTarget', 'replyTarget')
      .leftJoinAndSelect('replyTarget.sender', 'replyTargetSender')
      .orderBy('message.createdAt', 'DESC') // 최신순
      .take(limit);

    // 채팅 타입에 따라 조건 추가
    if (chatType === 'group') {
      queryBuilder.where('message.chat = :chatId', { chatId: chat.id });
    } else {
      queryBuilder.where('message.privateChat = :chatId', { chatId: chat.id });
    }

    const messages = await queryBuilder.getMany();

    // 파일 정보 추가
    const messagesWithFiles = await Promise.all(
      messages.map(async (message) => {
        if (message.fileIds && message.fileIds.length > 0) {
          try {
            const files = await Promise.all(
              message.fileIds.map(async (fileId) => {
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
            message.files = files.filter((file) => file !== null);
          } catch (error) {
            Logger.error(
              `Error fetching files for message ${message.id}:`,
              error,
            );
            message.files = [];
          }
        } else {
          message.files = [];
        }
        return message;
      }),
    );

    // 역순으로 정렬하여 반환 (오래된 것부터)
    return messagesWithFiles.reverse();
  }

  /**
   * 커서 이전의 메시지를 limit 개수만큼 가져오기
   * @param chatId 채팅방 ID
   * @param chatType 채팅 타입 ('group' | 'private')
   * @param cursor 커서 (메시지 ID)
   * @param limit 가져올 메시지 수
   * @returns 메시지 배열, hasMore 여부, 새로운 커서
   */
  async findBeforeCursor(
    chatId: string,
    chatType: 'group' | 'private',
    cursor: string,
    limit: number = 20,
  ): Promise<{ messages: Message[]; hasMore: boolean; newCursor?: string }> {
    let chat;

    if (chatType === 'group') {
      chat = await this.chatsService.findById(chatId);
    } else if (chatType === 'private') {
      chat = await this.chatsService.findPrivateChatById(chatId);
    }

    if (!chat) {
      throw new NotFoundException(`${chatType} Chat not found`);
    }

    // 커서 메시지 조회 (createdAt 기준으로 이전 메시지 가져오기)
    const cursorMessage = await this.messagesRepository.findOne({
      where: { id: cursor },
    });

    if (!cursorMessage) {
      throw new NotFoundException('Cursor message not found');
    }

    // 커서 메시지 이전의 메시지들을 가져오기 (limit + 1개로 가져와서 hasMore 판단)
    const queryBuilder = this.messagesRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.chat', 'chat')
      .leftJoinAndSelect('message.privateChat', 'privateChat');

    if (chatType === 'group') {
      queryBuilder.where('message.chat = :chatId', { chatId: chat.id });
    } else {
      queryBuilder.where('message.privateChat = :chatId', { chatId: chat.id });
    }

    queryBuilder
      .andWhere('message.createdAt < :cursorCreatedAt', {
        cursorCreatedAt: cursorMessage.createdAt,
      })
      .orderBy('message.createdAt', 'DESC')
      .take(limit + 1); // limit보다 1개 더 가져와서 hasMore 판단

    const messages = await queryBuilder.getMany();

    // 파일 정보 추가
    const messagesWithFiles = await Promise.all(
      messages.map(async (message) => {
        if (message.fileIds && message.fileIds.length > 0) {
          try {
            const files = await Promise.all(
              message.fileIds.map(async (fileId) => {
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
            message.files = files.filter((file) => file !== null);
          } catch (error) {
            Logger.error(
              `Error fetching files for message ${message.id}:`,
              error,
            );
            message.files = [];
          }
        } else {
          message.files = [];
        }
        return message;
      }),
    );

    // hasMore 판단: limit보다 많이 가져왔으면 더 있음
    const hasMore = messagesWithFiles.length > limit;
    const resultMessages = hasMore
      ? messagesWithFiles.slice(0, limit)
      : messagesWithFiles;

    // 역순으로 정렬하여 반환 (오래된 것부터)
    const reversedMessages = resultMessages.reverse();

    // 새로운 커서는 가장 오래된 메시지의 ID
    const newCursor =
      reversedMessages.length > 0 ? reversedMessages[0].id : undefined;

    return {
      messages: reversedMessages,
      hasMore,
      newCursor,
    };
  }

  async create(
    chatId: string,
    createMessageDto: CreateMessageDto,
    user: Users,
  ): Promise<Message> {
    const chat = await this.chatsService.findById(chatId);
    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    Logger.log(createMessageDto);
    Logger.log(user);
    Logger.log(chat);

    const message = this.messagesRepository.create({
      content: createMessageDto.content,
      chat: chat,
      sender: user,
      fileIds: createMessageDto.fileIds || null,
    });

    // 메시지를 저장합니다.
    const savedMessage = await this.messagesRepository.save(message);

    // Chat의 updated_at 업데이트
    await this.chatsService.updateChatUpdatedAt(chatId);

    // 저장된 메시지를 다시 조회해 sender 정보까지 포함한 완전한 메시지를 반환합니다.
    const fullMessage = await this.messagesRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sender', 'chat'], // sender의 전체 정보와 chat 관계를 가져옵니다.
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

    // 여기서는 브로드캐스트를 하지 않고, chat.gateway.ts.의  handleSendMessage에서만 브로드캐스트하도록 합니다.
    return fullMessage;
  }

  /**
   * 지정한 시간(분 단위)보다 오래된 모든 메시지 삭제 (그룹 채팅 + 1:1 채팅)
   */
  async deleteMessagesOlderThanMinutes(minutes: number): Promise<number> {
    if (minutes <= 0) return 0;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const result = await this.messagesRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff: cutoff.toISOString() })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * 모든 메시지 삭제 (오후 6시 일일 삭제 작업용)
   */
  async deleteAllMessages(): Promise<number> {
    const result = await this.messagesRepository
      .createQueryBuilder()
      .delete()
      .execute();
    return result.affected ?? 0;
  }
}
