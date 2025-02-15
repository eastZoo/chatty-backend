import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { Chat } from './chat.entity';
import { Users } from './users.entity';

@Entity()
export class ChatReadStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Chat, (chat) => chat.readStatuses, { onDelete: 'CASCADE' })
  chat: Chat;

  @ManyToOne(() => Users, (user) => user.readStatuses, { onDelete: 'CASCADE' })
  user: Users;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt: Date;
}
