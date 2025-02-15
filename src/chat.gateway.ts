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
import { Injectable, forwardRef, Inject, Logger } from '@nestjs/common';
import { MessagesService } from './app/messages/messages.service';
import { ChatsService } from './app/chats/chats.service'; // PrivateChat 관련 메서드가 있는 서비스

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
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
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
    @MessageBody() data: { roomId: string; chatType: 'group' | 'private' },
    @ConnectedSocket() client: Socket,
  ) {
    const { roomId, chatType } = data;

    try {
      if (!roomId || !chatType) {
        throw new Error('roomId and chatType are required');
      }

      const messages = await this.messagesService.findAllByChat(
        roomId,
        chatType,
      );
      console.log('messages', messages);
      client.emit('previousMessages', messages);
      console.log(
        `Sent previous messages for ${chatType} chat ${roomId} to socket ${client.id}`,
      );
    } catch (error) {
      console.error('Error in handleGetMessages:', error);
      client.emit('errorMessage', { error: 'Failed to retrieve messages' });
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody()
    data: {
      chatId: string;
      content: string;
      userId: string;
      username: string;
      chatType: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('sendMessage', data);
    try {
      if (!data.chatId || !data.content || !data.userId) {
        throw new Error('Missing required fields');
      }

      let savedMessage;
      if (data.chatType === 'private') {
        savedMessage = await this.chatsService.createPrivateMessage(
          data.chatId,
          data.content,
          data.userId,
        );
      } else {
        savedMessage = await this.messagesService.create(
          data.chatId,
          { content: data.content },
          { id: data.userId, username: data.username } as any,
        );
      }

      console.log('newMessage', data.chatId);
      this.server.to(data.chatId).emit('newMessage', savedMessage);
      console.log(`Broadcasted saved message to room ${data.chatId}`);
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      client.emit('errorMessage', { error: 'Failed to send message' });
    }
  }

  broadcastMessage(message: any) {
    console.log('message', message);
    if (message.chat && message.chat.id) {
      this.server.to(message.chat.id).emit('newMessage', message);
      console.log(`Broadcasted newMessage to room ${message.chat.id}`);
    } else {
      this.server.emit('newMessage', message);
      console.log(`Broadcasted newMessage to all clients`);
    }
  }
}
