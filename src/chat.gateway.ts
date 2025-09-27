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

    console.log('roomId', roomId);
    console.log('chatType', chatType);
    try {
      if (!roomId || !chatType) {
        throw new Error('roomId and chatType are required');
      }

      const messages = await this.messagesService.findAllByChat(
        roomId,
        chatType,
      );

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
      fileIds?: string[];
      fileAttachments?: any[];
    },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('data@@', data);
    try {
      // fileAttachments에서 fileIds 추출
      const fileIds =
        data.fileIds || data.fileAttachments?.map((file) => file.id) || [];

      if (!data.chatId || !data.userId) {
        throw new Error(
          'Missing required fields: chatId and userId are required',
        );
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
          data.userId,
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
          { id: data.userId, username: data.username } as any,
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
    data: { chatId: string; chatType: 'group' | 'private'; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      if (!data.chatId || !data.chatType || !data.userId) {
        throw new Error(
          'Missing required fields: chatId, chatType, and userId are required',
        );
      }

      // 읽음 상태 업데이트
      await this.chatsService.markChatAsRead(
        { id: data.userId } as any,
        { id: data.chatId, chatType: data.chatType } as any,
      );

      // 채팅방 목록 업데이트를 위한 이벤트 브로드캐스트
      this.server.emit('chatListUpdate', {
        type: 'read',
        chatId: data.chatId,
        chatType: data.chatType,
        userId: data.userId,
      });

      console.log(`Marked chat ${data.chatId} as read for user ${data.userId}`);
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
