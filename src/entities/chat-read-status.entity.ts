import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import { Users } from './users.entity';

export type ChatTypeForReadStatus = 'group' | 'private';

@Entity()
export class ChatReadStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 다형성 관계를 위해, 어떤 채팅방을 읽었는지 유형과 id를 저장합니다.
  @Column({ type: 'enum', enum: ['group', 'private'] })
  chatType: ChatTypeForReadStatus;

  @Column('uuid')
  chatId: string;

  @ManyToOne(() => Users, (user) => user.readStatuses, { onDelete: 'CASCADE' })
  user: Users;

  @UpdateDateColumn({ type: 'timestamp' })
  lastReadAt: Date;
}
