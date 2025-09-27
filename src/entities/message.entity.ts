// src/messages/message.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Chat } from './chat.entity';
import { Users } from './users.entity';
import { PrivateChat } from './private-chat.entity';

// 코드 첨부 기능 제거됨

@Entity()
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  @Column('simple-array', { nullable: true })
  fileIds: string[];

  // 파일 정보 (DB에 저장되지 않음, 조회 시에만 사용)
  files?: any[];

  @ManyToOne(() => Chat, (chat) => chat.messages, { eager: true }) // eager 옵션 추가
  chat: Chat;

  // 그룹 채팅용 기존 관계가 있다면 그대로 두고,
  // 1:1 채팅용 관계를 추가합니다.
  @ManyToOne(() => PrivateChat, (privateChat) => privateChat.messages, {
    nullable: true,
  })
  privateChat: PrivateChat;

  // 새롭게 추가: 메시지의 작성자 (사용자)
  @ManyToOne(() => Users, (user) => user.messages, { eager: true })
  sender: Users;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
