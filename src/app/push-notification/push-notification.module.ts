import { Module } from '@nestjs/common';
import { PushNotificationController } from './push-notification.controller';
import { PushNotificationService } from './push-notification.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivateChat } from 'src/entities/private-chat.entity';
import { Users } from 'src/entities/users.entity';
import { Message } from 'src/entities/message.entity';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [PushNotificationController],
  providers: [PushNotificationService],
  imports: [
    TypeOrmModule.forFeature([PrivateChat, Users, Message]),
    HttpModule,
  ],
})
export class PushNotificationModule {}
