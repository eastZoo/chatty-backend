// src/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  Injectable,
  forwardRef,
  Inject,
  Logger,
  UnauthorizedException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { MessagesService } from './app/messages/messages.service';
import { ChatsService } from './app/chats/chats.service'; // PrivateChat 관련 메서드가 있는 서비스
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './auth/redis.service';
import { AuthService } from './auth/auth.service';

// NestJS 10 does not export @Ack(). Socket.IO passes the acknowledgement as
// the third gateway argument, so expose it through a compatible WS parameter
// decorator instead of relying solely on implicit return-value ACK handling.
const SocketAck = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.getArgByIndex(2),
);

@WebSocketGateway({
  cors: { origin: '*' },
  path: '/socket.io', // 필요시 '/ws'로 변경
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => MessagesService))
    private messagesService: MessagesService,
    @Inject(forwardRef(() => ChatsService))
    private chatsService: ChatsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private authService: AuthService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // 쿼리 파라미터에서 토큰 추출
      const token = client.handshake.query.token as string;

      if (!token) {
        throw new UnauthorizedException('토큰이 없습니다.');
      }

      let payload: any;
      let accessToken = token;

      try {
        // 토큰 검증
        payload = this.jwtService.verify(token, {
          secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
        });
      } catch (verifyError) {
        // 토큰이 만료되었거나 유효하지 않은 경우
        console.log(`토큰 검증 실패, 재발급 시도: ${verifyError.message}`);

        // 토큰에서 userId 추출 시도 (만료된 토큰도 decode 가능)
        const decoded = this.jwtService.decode(token) as any;
        if (!decoded || !decoded.id) {
          throw new UnauthorizedException('유효하지 않은 토큰입니다.');
        }

        // Redis에서 Refresh Token 확인
        const refreshToken = await this.redisService.getRefreshToken(
          decoded.id,
        );
        if (!refreshToken) {
          throw new UnauthorizedException('Refresh Token이 없습니다.');
        }

        // 새로운 Access Token 발급
        accessToken = await this.authService.generateAccessToken(decoded.id);

        // 새로운 토큰으로 검증
        payload = this.jwtService.verify(accessToken, {
          secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
        });

        // Redis TTL 갱신
        await this.redisService.refreshTokenTTL(decoded.id);

        // 클라이언트에 새로운 토큰 전달
        client.emit('token-refreshed', { token: accessToken });
        console.log(
          `새로운 Access Token 발급 및 소켓 연결 허용: ${payload.username}`,
        );
      }

      // Redis에서 강제 로그아웃 확인
      const refreshToken = await this.redisService.getRefreshToken(payload.id);
      if (!refreshToken) {
        throw new UnauthorizedException('강제 로그아웃된 사용자입니다.');
      }

      // Redis TTL 갱신 (7일 연장)
      await this.redisService.refreshTokenTTL(payload.id);

      // 사용자 정보를 소켓에 저장
      client.data.user = payload;
      await client.join(`user:${payload.id}`);
      console.log(`Client connected: ${client.id}, User: ${payload.username}`);
    } catch (error) {
      console.error(`Connection failed: ${error.message}`);
      client.emit('error', { message: '인증에 실패했습니다.' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (!roomId) {
        throw new Error('Invalid room id');
      }
      const userId = client.data.user?.id;
      if (
        !userId ||
        !(await this.chatsService.canUserAccessAnyChat(roomId, userId))
      ) {
        throw new UnauthorizedException('You cannot access this chat');
      }

      if (!client.rooms.has(roomId)) {
        client.join(roomId);
        console.log(`Socket ${client.id} joined room ${roomId}`);
      } else {
        console.log(`Socket ${client.id} is already in room ${roomId}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Error in joinRoom: ${err.message}`);
      client.emit('errorMessage', { error: err.message });
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!roomId) {
      client.emit('errorMessage', { error: 'Invalid room id' });
      console.error(
        `leaveRoom called with invalid room id by socket ${client.id}`,
      );
      return;
    }
    client.leave(roomId);
    console.log(`Socket ${client.id} left room ${roomId}`);
  }

  @SubscribeMessage('getMessages')
  async handleGetMessages(
    @MessageBody()
    data: {
      roomId: string;
      chatType: 'group' | 'private';
      limit?: number;
      cursor?: string;
      direction?: 'latest' | 'before';
    },
    @ConnectedSocket() client: Socket,
  ) {
    const {
      roomId,
      chatType,
      limit: requestedLimit = 20,
      cursor,
      direction = 'latest',
    } = data;
    const limit = Math.min(Math.max(Number(requestedLimit) || 20, 1), 100);

    try {
      if (!roomId || !chatType) {
        throw new Error('getMessages roomId and chatType are required');
      }
      const userId = client.data.user?.id;
      if (
        !userId ||
        !(await this.chatsService.canUserAccessChat(roomId, chatType, userId))
      ) {
        throw new UnauthorizedException('You cannot access this chat');
      }

      let messages;
      let hasMore: boolean;
      let newCursor: string | undefined;

      if (direction === 'latest') {
        // 최신 메시지부터 limit 개 가져오기
        messages = await this.messagesService.findLatestByChat(
          roomId,
          chatType,
          limit,
        );
        // 첫 번째 메시지의 ID를 커서로 사용 (가장 오래된 메시지)
        newCursor = messages.length > 0 ? messages[0].id : undefined;
        // limit 개와 같으면 더 있을 가능성이 있음
        hasMore = messages.length === limit;
      } else {
        // cursor 이전 메시지 가져오기
        if (!cursor) {
          throw new Error('cursor is required for before direction');
        }
        const result = await this.messagesService.findBeforeCursor(
          roomId,
          chatType,
          cursor,
          limit,
        );
        messages = result.messages;
        hasMore = result.hasMore;
        newCursor = result.newCursor;
      }

      // 새로운 형식으로 응답 (기존 형식과의 호환성 유지)
      client.emit('previousMessages', {
        messages,
        hasMore,
        cursor: newCursor,
      });
    } catch (error) {
      console.error('getMessages Error in handleGetMessages:', error);
      client.emit('errorMessage', {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve messages',
      });
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody()
    data: {
      chatId: string;
      content: string;
      chatType: string;
      replyTargetId?: string;
      fileIds?: string[];
      fileAttachments?: any[];
      clientMessageId?: string;
    },
    @ConnectedSocket() client: Socket,
    @SocketAck()
    ack?: (response: {
      ok: boolean;
      message?: Record<string, unknown>;
      error?: string;
    }) => void,
  ): Promise<void> {
    try {
      // 소켓에 저장된 사용자 정보 확인
      const user = client.data.user;
      if (!user) {
        throw new UnauthorizedException('인증되지 않은 사용자입니다.');
      }

      // fileAttachments에서 fileIds 추출
      const fileIds =
        data.fileIds || data.fileAttachments?.map((file) => file.id) || [];

      if (!data.chatId) {
        throw new Error('Missing required fields: chatId is required');
      }
      if (data.chatType !== 'private' && data.chatType !== 'group') {
        throw new Error('Invalid chatType');
      }
      if (typeof data.content !== 'string' || data.content.length > 1000) {
        throw new Error('Message content must be at most 1000 characters');
      }
      if (fileIds.length > 10) {
        throw new Error('A message can contain at most 10 files');
      }
      if (data.clientMessageId && data.clientMessageId.length > 100) {
        throw new Error('Invalid clientMessageId');
      }
      // content가 없고 fileIds도 없으면 에러
      if (!data.content && !fileIds.length) {
        throw new Error('Either content or file attachments are required');
      }

      let savedMessage;
      if (data.chatType === 'private') {
        savedMessage = await this.chatsService.createPrivateMessage(
          data.chatId,
          data.content,
          user.id,
          data.replyTargetId ?? null,
          fileIds,
        );
      } else {
        savedMessage = await this.messagesService.create(
          data.chatId,
          {
            content: data.content,
            fileIds: fileIds,
          },
          { id: user.id, username: user.username } as any,
        );
      }
      const messageForBroadcast = {
        ...savedMessage,
        clientMessageId: data.clientMessageId,
      };

      this.server.to(data.chatId).emit('newMessage', messageForBroadcast);

      // 채팅방 목록 업데이트를 위한 이벤트 브로드캐스트
      if (data.chatType === 'private') {
        // 1:1 채팅의 경우 참여자들에게 채팅방 목록 업데이트 알림
        const privateChat = savedMessage.privateChat;
        const participantRooms = [
          privateChat?.userA?.id,
          privateChat?.userB?.id,
        ]
          .filter((userId): userId is string => Boolean(userId))
          .map((userId) => `user:${userId}`);

        if (participantRooms.length > 0) {
          // userA와 userB 모두에게 채팅방 목록 업데이트 알림
          this.server.to(participantRooms).emit('chatListUpdate', {
            type: 'private',
            chatId: data.chatId,
            message: messageForBroadcast,
          });
        }

        void this.chatsService
          .sendPushAlarms({
            chatId: data.chatId,
            content: data.content,
            userId: user.id,
          })
          .catch((pushError) => {
            Logger.error(
              `Failed to send push notification for chat ${data.chatId}`,
              pushError instanceof Error ? pushError.stack : String(pushError),
              ChatGateway.name,
            );
          });
      } else {
        // 그룹 채팅의 경우 해당 채팅방 참여자들에게 알림
        const groupChat = savedMessage.chat;
        const participantRooms = [
          groupChat?.user?.id,
          ...(groupChat?.participants?.map((participant) => participant.id) ??
            []),
        ]
          .filter((userId): userId is string => Boolean(userId))
          .map((userId) => `user:${userId}`);
        if (participantRooms.length > 0) {
          this.server
            .to([...new Set(participantRooms)])
            .emit('chatListUpdate', {
              type: 'group',
              chatId: data.chatId,
              message: messageForBroadcast,
            });
        }
      }
      ack?.({ ok: true, message: messageForBroadcast });
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send message';
      client.emit('errorMessage', { error: errorMessage });
      ack?.({ ok: false, error: errorMessage });
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @MessageBody()
    data: { chatId: string; chatType: 'group' | 'private' },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // 소켓에 저장된 사용자 정보 확인
      const user = client.data.user;
      if (!user) {
        throw new UnauthorizedException('인증되지 않은 사용자입니다.');
      }

      if (!data.chatId || !data.chatType) {
        throw new Error(
          'Missing required fields: chatId and chatType are required',
        );
      }
      if (
        !(await this.chatsService.canUserAccessChat(
          data.chatId,
          data.chatType,
          user.id,
        ))
      ) {
        throw new UnauthorizedException('You cannot access this chat');
      }

      // 채팅 읽음 상태 업데이트
      await this.messagesService.markMsgAsRead(
        user.id,
        data.chatId,
        data.chatType,
      );
      await this.chatsService.markChatAsRead(
        { id: user.id } as any,
        { id: data.chatId, chatType: data.chatType } as any,
      );

      // 채팅방 목록 업데이트를 위한 이벤트 브로드캐스트
      this.server.to(data.chatId).emit('chatListUpdate', {
        type: 'read',
        chatId: data.chatId,
        chatType: data.chatType,
        userId: user.id,
      });

      this.server.to(data.chatId).emit('messagesRead', {
        chatId: data.chatId,
        userId: user.id,
      });
    } catch (error) {
      console.error('Error in handleMarkAsRead:', error);
      client.emit('errorMessage', { error: 'Failed to mark as read' });
    }
  }

  broadcastMessage(message: any) {
    if (message.chat && message.chat.id) {
      this.server.to(message.chat.id).emit('newMessage', message);
      console.log(`Broadcasted newMessage to room ${message.chat.id}`);
    } else {
      this.server.emit('newMessage', message);
      console.log(`Broadcasted newMessage to all clients`);
    }
  }
}
