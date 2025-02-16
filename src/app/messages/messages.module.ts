import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from 'src/entities/message.entity';
import { Chat } from 'src/entities/chat.entity';
import { ChatsService } from '../chats/chats.service';
import { ChatGateway } from 'src/chat.gateway';
import { PrivateChat } from 'src/entities/private-chat.entity';
import { Users } from 'src/entities/users.entity';
import { ChatReadStatus } from 'src/entities/chat-read-status.entity';
import { PushNotificationService } from '../push-notification/push-notification.service';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Message,
      Chat,
      PrivateChat,
      Users,
      ChatReadStatus,
    ]),
    HttpModule,
  ],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    ChatsService,
    ChatGateway,
    PushNotificationService,
  ],
})
export class MessagesModule {}
