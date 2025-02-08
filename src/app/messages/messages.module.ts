import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from 'src/entities/message.entity';
import { Chat } from 'src/entities/chat.entity';
import { ChatsService } from '../chats/chats.service';
import { ChatGateway } from 'src/chat.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Chat])],
  controllers: [MessagesController],
  providers: [MessagesService, ChatsService, ChatGateway],

})
export class MessagesModule {}
