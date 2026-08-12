import { ChatGateway } from './chat.gateway';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { MessagesService } from './app/messages/messages.service';
import { ChatsService } from './app/chats/chats.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './auth/redis.service';
import { AuthService } from './auth/auth.service';

describe('ChatGateway sendMessage acknowledgement', () => {
  const sender = { id: 'user-a', username: 'sender' };
  const savedMessage = {
    id: 'server-message-1',
    content: 'hello',
    sender,
    privateChat: {
      id: 'chat-1',
      userA: sender,
      userB: { id: 'user-b', username: 'receiver' },
    },
  };

  function setup() {
    const roomEmit = jest.fn();
    const serverTo = jest.fn(() => ({ emit: roomEmit }));
    const messagesService = {
      create: jest.fn(),
    };
    const chatsService = {
      createPrivateMessage: jest.fn().mockResolvedValue(savedMessage),
      sendPushAlarms: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = new ChatGateway(
      messagesService as never,
      chatsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    gateway.server = { to: serverTo } as never;

    const client = {
      data: { user: sender },
      emit: jest.fn(),
    };
    const ack = jest.fn();

    return {
      ack,
      chatsService,
      client,
      gateway,
      roomEmit,
      serverTo,
    };
  }

  it('explicitly ACKs once and echoes clientMessageId after persistence', async () => {
    const { ack, chatsService, client, gateway, roomEmit } = setup();

    await gateway.handleSendMessage(
      {
        chatId: 'chat-1',
        chatType: 'private',
        content: 'hello',
        clientMessageId: 'client-message-1',
      },
      client as never,
      ack,
    );

    expect(chatsService.createPrivateMessage).toHaveBeenCalledTimes(1);
    expect(roomEmit).toHaveBeenCalledWith(
      'newMessage',
      expect.objectContaining({
        id: 'server-message-1',
        clientMessageId: 'client-message-1',
      }),
    );
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({
      ok: true,
      message: expect.objectContaining({
        id: 'server-message-1',
        clientMessageId: 'client-message-1',
      }),
    });
  });

  it('ACKs failure without broadcasting when persistence fails', async () => {
    const { ack, chatsService, client, gateway, roomEmit } = setup();
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    chatsService.createPrivateMessage.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await gateway.handleSendMessage(
      {
        chatId: 'chat-1',
        chatType: 'private',
        content: 'hello',
        clientMessageId: 'client-message-1',
      },
      client as never,
      ack,
    );
    consoleError.mockRestore();

    expect(roomEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: 'database unavailable',
    });
    expect(client.emit).toHaveBeenCalledWith('errorMessage', {
      error: 'database unavailable',
    });
  });

  it('delivers the explicit ACK through a real Socket.IO connection', async () => {
    const chatsService = {
      createPrivateMessage: jest.fn().mockResolvedValue(savedMessage),
      sendPushAlarms: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: MessagesService,
          useValue: { create: jest.fn() },
        },
        { provide: ChatsService, useValue: chatsService },
        {
          provide: JwtService,
          useValue: { verify: jest.fn().mockReturnValue(sender) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        {
          provide: RedisService,
          useValue: {
            getRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
            refreshTokenTTL: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuthService,
          useValue: { generateAccessToken: jest.fn() },
        },
      ],
    }).compile();

    let app: INestApplication | undefined;
    let socket: ClientSocket | undefined;
    try {
      app = moduleRef.createNestApplication();
      await app.listen(0, '127.0.0.1');
      const { port } = app.getHttpServer().address() as AddressInfo;
      socket = io(`http://127.0.0.1:${port}`, {
        path: '/socket.io',
        transports: ['websocket'],
        query: { token: 'valid-access-token' },
      });
      await new Promise<void>((resolve, reject) => {
        socket?.once('connect', resolve);
        socket?.once('connect_error', reject);
      });

      const response = await socket.timeout(2000).emitWithAck('sendMessage', {
        chatId: 'chat-1',
        chatType: 'private',
        content: 'hello',
        clientMessageId: 'client-message-1',
      });

      expect(response).toEqual({
        ok: true,
        message: expect.objectContaining({
          id: 'server-message-1',
          clientMessageId: 'client-message-1',
        }),
      });
      expect(chatsService.createPrivateMessage).toHaveBeenCalledTimes(1);
    } finally {
      socket?.disconnect();
      await app?.close();
      await moduleRef.close();
    }
  });
});
