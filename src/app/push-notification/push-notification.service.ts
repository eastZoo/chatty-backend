// src/push-notification/push-notification.service.ts
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PrivateChat } from 'src/entities/private-chat.entity';
import { Users } from 'src/entities/users.entity';
import { Message } from 'src/entities/message.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PushNotificationService {
  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(PrivateChat)
    private readonly privateChatRepository: Repository<PrivateChat>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  // 메시지 생성시 푸시 알림 전송
  async createPrivateMessage(
    roomId: string,
    content: string,
    senderId: string,
  ): Promise<Message> {
    const privateChat = await this.privateChatRepository.findOne({
      where: { id: roomId },
      relations: ['messages'],
    });
    if (!privateChat) {
      throw new BadRequestException('Private chat not found');
    }
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
    const savedMessage = await this.messageRepository.save(message);

    // 수신자(B) 결정: sender가 A이면, 수신자는 B
    const recipient =
      privateChat.userA.id === senderId ? privateChat.userB : privateChat.userA;

    // recipient의 FCM 토큰 조회
    if (recipient && recipient.fcmToken) {
      // PushNotificationService 주입을 통해 알림 전송 (의존성 주입 설정 필요)
      await this.sendPushNotification(
        recipient.fcmToken,
        sender.username, // A의 이름
        content, // 전송한 메시지 내용
      );
    }
    return savedMessage;
  }

  async sendPushNotification(token: string, title: string, body: string) {
    const message = {
      message: {
        token,
        notification: { title, body },
      },
    };

    // FCM HTTP v1 API URL: Firebase 콘솔에서 프로젝트 설정에 따라 확인합니다.
    const url = `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`;

    // 서버 인증: OAuth 2.0 토큰 또는 서비스 계정 키를 사용합니다.
    const serverToken = `${process.env.FCM_SERVER_TOKEN}`;

    await this.httpService
      .post(url, message, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serverToken}`,
        },
      })
      .toPromise();
  }
}
