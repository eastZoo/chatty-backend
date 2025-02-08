// src/chats/chat.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Users } from './users.entity';
import { Message } from './message.entity';

@Entity()
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'New Chat' })
  title: string;

  @ManyToOne(() => Users, (user) => user.chats, { eager: true })
  user: Users;

  @OneToMany(() => Message, (message) => message.chat, { cascade: true })
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
