// src/users/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import { Chat } from './chat.entity';
import * as bcrypt from 'bcryptjs';
import { Message } from './message.entity';
import { Friendship } from './friend.entity';
import { ChatReadStatus } from './chat-read-status.entity';
import { FcmToken } from './fcm-token.entity';

@Entity()
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', length: 20, default: 'USER' })
  type: string; // 'USER' | 'ADMIN'

  @BeforeInsert()
  async setPassword() {
    this.password = await bcrypt.hash(this.password, 10);
  }

  @OneToMany(() => Chat, (chat) => chat.user)
  chats: Chat[];

  // 새롭게 추가: 사용자가 보낸 메시지들
  @OneToMany(() => Message, (message) => message.sender)
  messages: Message[];

  // 추가: fcm 토큰 연결
  @OneToMany(() => FcmToken, (token) => token.user)
  fcmTokens: FcmToken[];

  @OneToMany(() => Friendship, (friendship) => friendship.requester)
  sentFriendRequests: Friendship[];

  @OneToMany(() => Friendship, (friendship) => friendship.receiver)
  receivedFriendRequests: Friendship[];

  @OneToMany(() => ChatReadStatus, (readStatus) => readStatus.user)
  readStatuses: ChatReadStatus[];
}
