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
} from '@nestjs/common';
import { MessagesService } from './app/messages/messages.service';
import { ChatsService } from './app/chats/chats.service'; // PrivateChat 관련 메서드가 있는 서비스
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './auth/redis.service';

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
  ) {}

  async handleConnection(client: Socket) {
    try {
      // 쿼리 파라미터에서 토큰 추출
      const token = client.handshake.query.token as string;

      if (!token) {
        throw new UnauthorizedException('토큰이 없습니다.');
      }

      // 토큰 검증
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
      });

      // Redis에서 강제 로그아웃 확인
      const refreshToken = await this.redisService.getRefreshToken(payload.id);
      if (!refreshToken) {
        throw new UnauthorizedException('강제 로그아웃된 사용자입니다.');
      }

      // 사용자 정보를 소켓에 저장
      client.data.user = payload;
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
  handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (!roomId) {
        throw new Error('Invalid room id');
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
    const { roomId, chatType, limit = 20, cursor, direction = 'latest' } = data;

    console.log('getMessages 요청:', {
      roomId,
      chatType,
      limit,
      cursor,
      direction,
    });

    try {
      if (!roomId || !chatType) {
        throw new Error('getMessages roomId and chatType are required');
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

      console.log(
        `getMessages Sent ${messages.length} messages (hasMore: ${hasMore}) for ${chatType} chat ${roomId} to socket ${client.id}`,
      );
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
      fileIds?: string[];
      fileAttachments?: any[];
    },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('data@@', data);
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

      // content가 없고 fileIds도 없으면 에러
      if (!data.content && !fileIds.length) {
        throw new Error('Either content or file attachments are required');
      }

      let savedMessage;
      if (data.chatType === 'private') {
        Logger.log('createMessage112');
        savedMessage = await this.chatsService.createPrivateMessage(
          data.chatId,
          data.content,
          user.id,
          fileIds,
        );
      } else {
        Logger.log('createMessage11');
        savedMessage = await this.messagesService.create(
          data.chatId,
          {
            content: data.content,
            fileIds: fileIds,
          },
          { id: user.id, username: user.username } as any,
        );
      }
      this.server.to(data.chatId).emit('newMessage', savedMessage);
      console.log(`Broadcasted saved message to room ${data.chatId}`);

      // 채팅방 목록 업데이트를 위한 이벤트 브로드캐스트
      if (data.chatType === 'private') {
        // 1:1 채팅의 경우 참여자들에게 채팅방 목록 업데이트 알림
        const privateChat = await this.chatsService.findPrivateChatById(
          data.chatId,
        );
        if (privateChat) {
          // userA와 userB 모두에게 채팅방 목록 업데이트 알림
          this.server.emit('chatListUpdate', {
            type: 'private',
            chatId: data.chatId,
            message: savedMessage,
          });
        }
      } else {
        // 그룹 채팅의 경우 해당 채팅방 참여자들에게 알림
        this.server.emit('chatListUpdate', {
          type: 'group',
          chatId: data.chatId,
          message: savedMessage,
        });
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      client.emit('errorMessage', { error: 'Failed to send message' });
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

      // 읽음 상태 업데이트
      await this.chatsService.markChatAsRead(
        { id: user.id } as any,
        { id: data.chatId, chatType: data.chatType } as any,
      );

      // 채팅방 목록 업데이트를 위한 이벤트 브로드캐스트
      this.server.emit('chatListUpdate', {
        type: 'read',
        chatId: data.chatId,
        chatType: data.chatType,
        userId: user.id,
      });

      console.log(`Marked chat ${data.chatId} as read for user ${user.id}`);
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
