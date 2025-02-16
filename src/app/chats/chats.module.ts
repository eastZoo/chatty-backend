// src/chats/chats.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chat } from '../../entities/chat.entity';
import { PrivateChat } from '../../entities/private-chat.entity';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { UsersModule } from '../users/users.module';
import { Message } from '../../entities/message.entity';
import { ChatReadStatus } from '../../entities/chat-read-status.entity';
import { Users } from 'src/entities/users.entity';
import { HttpModule } from '@nestjs/axios';
import { PushNotificationService } from '../push-notification/push-notification.service';
// src/chats/chats.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chat,
      PrivateChat,
      Message,
      ChatReadStatus,
      Users,
    ]),
    forwardRef(() => UsersModule),
    HttpModule,
  ],
  providers: [ChatsService, PushNotificationService],
  controllers: [ChatsController],
  exports: [ChatsService],
})
export class ChatsModule {}
