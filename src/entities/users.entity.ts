// src/users/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, BeforeInsert } from 'typeorm';
import { Chat } from './chat.entity';
import * as bcrypt from 'bcryptjs';
import { Message } from './message.entity';

@Entity()
export class Users {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @BeforeInsert()
  async setPassword() {
    this.password = await bcrypt.hash(this.password, 10);
  }

  
  @OneToMany(() => Chat, (chat) => chat.user)
  chats: Chat[];

   // 새롭게 추가: 사용자가 보낸 메시지들
  @OneToMany(() => Message, (message) => message.sender)
  messages: Message[];
}
