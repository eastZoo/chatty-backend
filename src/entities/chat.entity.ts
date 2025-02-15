import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Users } from './users.entity';
import { Message } from './message.entity';
import { ChatReadStatus } from './chat-read-status.entity';

export enum ChatType {
  GROUP = 'group',
  PRIVATE = 'private',
}

@Entity()
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'New Chat' })
  title: string;

  @Column({ type: 'enum', enum: ChatType, default: ChatType.GROUP })
  type: ChatType; // 주로 그룹 채팅을 의미

  @ManyToOne(() => Users, (user) => user.chats, { eager: true })
  user: Users; // 채팅방 생성자

  @ManyToMany(() => Users, { eager: true })
  @JoinTable()
  participants: Users[]; // 여러 참여자

  @OneToMany(() => Message, (message) => message.chat, { cascade: true })
  messages: Message[];

  @OneToMany(() => ChatReadStatus, (readStatus) => readStatus.chat)
  readStatuses: ChatReadStatus[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
