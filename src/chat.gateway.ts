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
import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { MessagesService } from './app/messages/messages.service';

@WebSocketGateway({ cors: { origin: '*' } })
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => MessagesService))
    private messagesService: MessagesService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // 클라이언트가 채팅방에 입장할 때 처리: 해당 채팅방(room)에 소켓을 join 시킵니다.
  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() roomId: string, @ConnectedSocket() client: Socket) {
    client.join(roomId);
    console.log(`Socket ${client.id} joined room ${roomId}`);
  }

  // 클라이언트가 채팅방을 떠날 때 처리
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(@MessageBody() roomId: string, @ConnectedSocket() client: Socket) {
    client.leave(roomId);
    console.log(`Socket ${client.id} left room ${roomId}`);
  }

  // 클라이언트가 채팅방의 이전 메시지를 요청할 때 처리
  @SubscribeMessage('getMessages')
  async handleGetMessages(@MessageBody() roomId: string, @ConnectedSocket() client: Socket) {
    // MessagesService를 사용하여 해당 채팅방의 메시지를 조회합니다.
    const messages = await this.messagesService.findAllByChat(roomId);
    // 요청한 소켓에 이전 메시지를 보내줍니다.
    client.emit('previousMessages', messages);
    console.log(`Sent previous messages for room ${roomId} to socket ${client.id}`);
  }

  // 만약 클라이언트에서 sendMessage 이벤트를 사용한다면,
  // 이 핸들러에서 저장과 브로드캐스트를 동시에 할 수도 있습니다.
 // 수정된 sendMessage 핸들러: 메시지를 DB에 저장한 후 브로드캐스트
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: { chatId: string; content: string; userId: number; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log("sendMessage", data);

    // 여기서는 client로부터 받은 userId, username 정보를 사용합니다.
    // 실제로는 인증 미들웨어를 통해 검증하는 것이 좋습니다.
    try {
      const savedMessage = await this.messagesService.create(
        data.chatId,
        { content: data.content },
        { id: data.userId, username: data.username } as any, // Users 엔티티에 맞게 변환
      );
      // 저장된 메시지를 해당 채팅방에 브로드캐스트
      this.server.to(data.chatId).emit('newMessage', savedMessage);
      console.log(`Broadcasted saved message to room ${data.chatId}`);
    } catch (error) {
      console.error("Error in handleSendMessage:", error);
      // 에러 발생 시 클라이언트에 에러 메시지를 보낼 수도 있습니다.
      client.emit('errorMessage', { error: '메시지 전송에 실패했습니다.' });
    }
  }

  // 기존 broadcastMessage 메서드 (REST API에서 호출할 경우)
  broadcastMessage(message: any) {
    // 해당 채팅방(room)에 있는 클라이언트에게만 전송할 수도 있습니다.
    if (message.chat && message.chat.id) {
      this.server.to(message.chat.id).emit('newMessage', message);
      console.log(`Broadcasted newMessage to room ${message.chat.id}`);
    } else {
      // fallback: 모든 클라이언트에게 전송
      this.server.emit('newMessage', message);
      console.log(`Broadcasted newMessage to all clients`);
    }
  }
}
