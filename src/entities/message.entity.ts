// src/messages/message.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Chat } from './chat.entity';
import { Users } from './users.entity';

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')   
  content: string;

  @ManyToOne(() => Chat, (chat) => chat.messages, { eager: true })  // eager 옵션 추가
  chat: Chat;


  // 새롭게 추가: 메시지의 작성자 (사용자)
  @ManyToOne(() => Users, (user) => user.messages, { eager: true })
  sender: Users;


  @CreateDateColumn()
  createdAt: Date;
}
