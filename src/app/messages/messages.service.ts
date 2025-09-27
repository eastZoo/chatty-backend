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

    // 여기서는 브로드캐스트를 하지 않고, chat.gateway.ts.의  handleSendMessage에서만 브로드캐스트하도록 합니다.
    return fullMessage;
  }
}
